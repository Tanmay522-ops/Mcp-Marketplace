"use server"

import { Prisma } from "@prisma/client"
import { client } from "@/lib/prisma"
import { getCallerContext } from "@/hooks/useCallerContext"
import { encryptSecret } from "@/lib/tool-crypto"

const installWithToolInclude = {
    toolVersion: {
        select: {
            id: true,
            version: true,
            endpoint: true,
            capabilities: {
                select: { id: true, name: true, description: true },
            },
            tool: {
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    logoUrl: true,
                    requiresAuth: true,
                    deployments: {
                        orderBy: { createdAt: "desc" },
                        take: 1,
                        select: { status: true },
                    },
                },
            },
        },
    },
} satisfies Prisma.InstallRecordInclude

export type InstallWithTool = Prisma.InstallRecordGetPayload<{
    include: typeof installWithToolInclude
}>

export const getWorkspaceInstalls = async (workspaceId: string) => {
    try {
        const ctx = await getCallerContext(workspaceId)
        if (ctx.error) return ctx.error

        const installs = await client.installRecord.findMany({
            where: { workspaceId },
            include: installWithToolInclude,
            orderBy: { installedAt: "desc" },
        })

        return { status: 200 as const, data: { installs } }
    } catch (error) {
        console.error("getWorkspaceInstalls error:", error)
        return { status: 500 as const, message: "Internal error fetching installs" }
    }
}

const buildMarketplaceToolInclude = (workspaceId: string) =>
    ({
        versions: {
            where: { status: "PUBLISHED" as const },
            orderBy: { createdAt: "desc" as const },
            take: 1,
            select: {
                id: true,
                version: true,
                installs: {
                    where: { workspaceId },
                    select: { id: true, status: true },
                },
            },
        },
        analytics: { select: { totalInstalls: true } },
    }) satisfies Prisma.ToolInclude

export type MarketplaceTool = Prisma.ToolGetPayload<{
    include: ReturnType<typeof buildMarketplaceToolInclude>
}>

export const searchMarketplaceTools = async (workspaceId: string, query?: string) => {
    try {
        const ctx = await getCallerContext(workspaceId)
        if (ctx.error) return ctx.error

        const tools = await client.tool.findMany({
            where: {
                visibility: "PUBLIC",
                versions: { some: { status: "PUBLISHED" } },
                ...(query ? { name: { contains: query, mode: "insensitive" as const } } : {}),
            },
            include: buildMarketplaceToolInclude(workspaceId),
            orderBy: { analytics: { totalInstalls: "desc" } },
        })

        return { status: 200 as const, data: { tools } }
    } catch (error) {
        console.error("searchMarketplaceTools error:", error)
        return { status: 500 as const, message: "Internal error searching tools" }
    }
}

type InstallToolInput = {
    workspaceId: string
    toolVersionId: string
    method?: "MANUAL" | "GITHUB"
}

export const installTool = async ({ workspaceId, toolVersionId, method = "MANUAL" }: InstallToolInput) => {
    try {
        const ctx = await getCallerContext(workspaceId)
        if (ctx.error) return ctx.error

        const toolVersion = await client.toolVersion.findUnique({
            where: { id: toolVersionId },
            select: {
                toolId: true,
                status: true,
                tool: { select: { visibility: true, requiresAuth: true, usesApiKey: true } },
            },
        })
        if (!toolVersion) {
            return { status: 404 as const, message: "Tool version not found" }
        }
        if (toolVersion.status !== "PUBLISHED") {
            return { status: 409 as const, message: "This tool version isn't published yet" }
        }
        if (toolVersion.tool.visibility !== "PUBLIC") {
            return { status: 403 as const, message: "This tool isn't publicly installable" }
        }

        const existing = await client.installRecord.findUnique({
            where: { workspaceId_toolVersionId: { workspaceId, toolVersionId } },
        })
        if (existing) {
            return { status: 409 as const, message: "Already installed in this workspace" }
        }

        // A tool that's never been through its connection step yet — OAuth
        // authorize, or (new) pasting an API key — is NOT_CONNECTED, not
        // PENDING (that's reserved for "attempted but cancelled/failed").
        // The other branch (no auth of any kind needed) is unrelated and
        // untouched.
        const initialStatus = toolVersion.tool.requiresAuth || toolVersion.tool.usesApiKey
            ? "NOT_CONNECTED"
            : method === "MANUAL"
                ? "ACTIVE"
                : "PENDING"

        const install = await client.installRecord.create({
            data: {
                workspaceId,
                toolVersionId,
                installedById: ctx.userId,
                method,
                status: initialStatus,
            },
        })

        await client.toolAnalytics
            .update({
                where: { toolId: toolVersion.toolId },
                data: { totalInstalls: { increment: 1 } },
            })
            .catch((err: unknown) => console.error("installTool: analytics increment failed:", err))

        return {
            status: 201 as const,
            data: install,
            requiresAuth: toolVersion.tool.requiresAuth,
        }
    } catch (error) {
        console.error("installTool error:", error)
        return { status: 500 as const, message: "Internal error installing tool" }
    }
}

// Removes the tool from THIS WORKSPACE only — never a Railway teardown.
// Covers both shapes a tool can be in on the detail page:
//  - has an InstallRecord (OAuth tools, or a custom deploy that's reached
//    RUNNING and got one auto-created by pollDeploymentStatus) -> delete
//    that record, deployed infra (if any) untouched.
//  - custom-deploy-only, no InstallRecord yet (still PENDING/BUILDING/
//    DEPLOYING/ERROR) -> Tool.workspaceId is this tool's sole owner, so
//    deleting the Tool row is what "remove from this workspace" means;
//    it cascades the Deployment row away in the DB only, no Railway call.
export const uninstallTool = async (workspaceId: string, toolId: string) => {
    try {
        const ctx = await getCallerContext(workspaceId)
        if (ctx.error) return ctx.error

        // Deliberately NOT scoped by workspaceId here — a marketplace
        // tool's Tool row is owned by whichever workspace originally
        // PUBLISHED it, which is very often a different workspace than
        // the one calling Remove (that's the entire point of the
        // marketplace: install a tool someone else published). Scoping
        // this lookup by workspaceId silently breaks removal for every
        // installed-but-not-owned tool — "Tool not found" even though
        // the workspace clearly has it installed.
        const tool = await client.tool.findUnique({
            where: { id: toolId },
            select: {
                id: true,
                workspaceId: true,
                deployments: { select: { id: true }, take: 1 },
                versions: {
                    select: {
                        installs: {
                            where: { workspaceId },
                            select: { id: true },
                        },
                    },
                },
            },
        })
        if (!tool) {
            return { status: 404 as const, message: "Tool not found" }
        }

        // This workspace has its own InstallRecord for this tool ->
        // remove just that. Covers both a marketplace install AND a
        // custom deploy that's already reached RUNNING.
        const installId = tool.versions.flatMap((v) => v.installs)[0]?.id
        if (installId) {
            await client.installRecord.delete({ where: { id: installId } })
            return { status: 200 as const }
        }

        // No InstallRecord yet, but this workspace actually OWNS the
        // Tool row (a custom deploy still PENDING/BUILDING/DEPLOYING/
        // ERROR, before an InstallRecord existed) -> deleting the Tool
        // row itself is what "remove from this workspace" means, since
        // this workspace is its only owner. The explicit ownership check
        // here matters: never delete a Tool row this workspace doesn't
        // actually own, even if it somehow has no matching InstallRecord.
        if (tool.workspaceId === workspaceId && tool.deployments.length > 0) {
            await client.tool.delete({ where: { id: tool.id } })
            return { status: 200 as const }
        }

        return { status: 404 as const, message: "Nothing to remove for this workspace" }
    } catch (error) {
        console.error("uninstallTool error:", error)
        return { status: 500 as const, message: "Internal error uninstalling tool" }
    }
}

// Disconnects an OAuth-connected tool WITHOUT removing it from the
// workspace — the InstallRecord stays, it just goes back to
// NOT_CONNECTED, and any stored tokens are cleared (a fresh
// authorization should get fresh tokens; there's no reason to keep old
// ones around once the connection is deliberately being reset). This is
// what the "Delete" action in the tool detail page's header/kebab menu
// actually means for an OAuth-based tool — it's a disconnect, not a
// removal from the workspace. Only applies where an install record
// exists at all; a custom-deployed tool with no InstallRecord yet has
// nothing here to disconnect.
export const disconnectTool = async (workspaceId: string, toolId: string) => {
    try {
        const ctx = await getCallerContext(workspaceId)
        if (ctx.error) return ctx.error

        const tool = await client.tool.findUnique({
            where: { id: toolId },
            select: {
                versions: {
                    select: {
                        installs: {
                            where: { workspaceId },
                            select: { id: true },
                        },
                    },
                },
            },
        })
        if (!tool) {
            return { status: 404 as const, message: "Tool not found" }
        }

        const installId = tool.versions.flatMap((v) => v.installs)[0]?.id
        if (!installId) {
            return { status: 404 as const, message: "Nothing connected to disconnect for this workspace" }
        }

        await client.installRecord.update({
            where: { id: installId },
            data: {
                status: "NOT_CONNECTED",
                oauthAccessToken: null,
                oauthRefreshToken: null,
                oauthExpiresAt: null,
                apiKeyEncrypted: null,
            },
        })

        return { status: 200 as const }
    } catch (error) {
        console.error("disconnectTool error:", error)
        return { status: 500 as const, message: "Internal error disconnecting tool" }
    }
}

// Connects an API-key-based tool (e.g. ElevenLabs) — the workspace's own
// counterpart to the OAuth callback route, just without any redirect
// chain: the user pastes their key directly, we encrypt it and flip the
// install to ACTIVE. Same "don't require Tool ownership" fix already
// applied to uninstallTool/getToolDetail — a marketplace tool's Tool row
// belongs to whoever published it, not to every workspace that installs
// it, so the lookup here isn't scoped by workspaceId either.
export const connectApiKey = async (workspaceId: string, toolId: string, apiKey: string) => {
    try {
        const ctx = await getCallerContext(workspaceId)
        if (ctx.error) return ctx.error

        const trimmedKey = apiKey.trim()
        if (!trimmedKey) {
            return { status: 400 as const, message: "API key is required" }
        }

        const tool = await client.tool.findUnique({
            where: { id: toolId },
            select: {
                workspaceId: true,
                visibility: true,
                usesApiKey: true,
                apiKeyHeaderName: true,
                apiKeyValidationUrl: true,
                versions: {
                    where: { status: "PUBLISHED" },
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: {
                        id: true,
                        installs: { where: { workspaceId }, select: { id: true } },
                    },
                },
            },
        })
        if (!tool || (tool.workspaceId !== workspaceId && tool.visibility !== "PUBLIC")) {
            return { status: 404 as const, message: "Tool not found" }
        }
        if (!tool.usesApiKey) {
            return { status: 400 as const, message: "This tool doesn't use API key authentication" }
        }

        const installId = tool.versions[0]?.installs[0]?.id
        if (!installId) {
            return { status: 404 as const, message: "Install this tool first, then connect your API key" }
        }

        // Real validation, when the tool has a check URL configured —
        // actually calls the provider with this key before trusting it,
        // instead of saving whatever was typed and finding out it's wrong
        // only later when the tool gets used. Skipped (not failed) if no
        // validation URL is set — that's the fallback, not the
        // recommendation; see the schema comment on apiKeyValidationUrl.
        if (tool.apiKeyValidationUrl) {
            const headerName = tool.apiKeyHeaderName || "Authorization"
            const headerValue = headerName.toLowerCase() === "authorization" ? `Bearer ${trimmedKey}` : trimmedKey

            let validationOk = false
            try {
                const res = await fetch(tool.apiKeyValidationUrl, {
                    method: "GET",
                    headers: { [headerName]: headerValue },
                })
                if (res.ok) {
                    validationOk = true
                } else {
                    // A non-2xx response doesn't automatically mean a fake/
                    // wrong key. ElevenLabs, for example, returns 401 with
                    // { detail: { status: "missing_permissions" } } when the
                    // key is genuine but scoped to fewer permissions than
                    // this specific check happens to probe — a real,
                    // legitimately-restricted key someone made on purpose,
                    // not the same thing as a made-up string. A true bad key
                    // reports differently (e.g. "invalid_api_key"), so this
                    // only widens acceptance for the "real key, narrower
                    // scope" case, not for genuinely wrong keys.
                    // Safe for other future API-key tools too: if a
                    // different provider's error body doesn't have this
                    // exact shape, the optional chaining below just
                    // evaluates to undefined and falls through to the
                    // existing strict rejection — this never loosens
                    // validation for a tool whose errors look different.
                    const body: unknown = await res.json().catch(() => null)
                    const errorStatus = (body as { detail?: { status?: string } } | null)?.detail?.status
                    validationOk = errorStatus === "missing_permissions"
                }
            } catch (error) {
                console.error("connectApiKey: validation request failed:", error)
                validationOk = false
            }

            if (!validationOk) {
                return { status: 400 as const, message: "That API key was rejected — double-check it and try again." }
            }
        }

        await client.installRecord.update({
            where: { id: installId },
            data: {
                status: "ACTIVE",
                apiKeyEncrypted: encryptSecret(trimmedKey),
            },
        })

        return { status: 200 as const }
    } catch (error) {
        console.error("connectApiKey error:", error)
        return { status: 500 as const, message: "Internal error connecting API key" }
    }
}