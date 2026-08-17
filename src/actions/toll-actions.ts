"use server"

import { client } from "@/lib/prisma"
import { getCallerContext } from "@/hooks/useCallerContext"
import type { DeploymentStatus, InstallStatus } from "@prisma/client"

export type ToolDetail = {
    id: string
    name: string
    slug: string
    description: string
    logoUrl: string | null
    websiteUrl: string | null
    documentationUrl: string | null
    requiresAuth: boolean
    // New third connection type, alongside OAuth (requiresAuth) and
    // no-auth-needed — a static API key instead of any OAuth flow.
    usesApiKey: boolean
    // FIXED (audit item): needed so the client can call buildToolEndpoint
    // itself instead of hand-rolling the same fallback logic inline.
    workspaceSlug: string
    deployment: {
        id: string
        status: DeploymentStatus
        errorMessage: string | null
        railwayDomain: string | null
        updatedAt: Date
    } | null
    version: {
        id: string
        version: string
        endpoint: string
    } | null
    install: {
        id: string
        status: InstallStatus
        installedAt: Date
        // Never the actual key — just whether one's already stored, so
        // the UI knows to show "Update key" vs "Connect" wording.
        hasApiKey: boolean
    } | null
}

export const getToolDetail = async (workspaceId: string, toolId: string) => {
    try {
        const ctx = await getCallerContext(workspaceId)
        if (ctx.error) return ctx.error

        // Deliberately NOT scoped by workspaceId in the where clause —
        // same bug class as uninstallTool had: a marketplace tool's Tool
        // row is owned by whichever workspace originally published it,
        // not by every workspace that installed it. A brand-new workspace
        // installing an existing public tool (e.g. Linear) would 404 here
        // otherwise, even though it clearly has that tool installed.
        // Authorization is handled explicitly below instead.
        const tool = await client.tool.findUnique({
            where: { id: toolId },
            select: {
                id: true,
                workspaceId: true,
                visibility: true,
                name: true,
                slug: true,
                description: true,
                logoUrl: true,
                websiteUrl: true,
                documentationUrl: true,
                requiresAuth: true,
                usesApiKey: true,
                workspace: { select: { slug: true } },
                deployments: {
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: { id: true, status: true, errorMessage: true, railwayDomain: true, updatedAt: true },
                },
                versions: {
                    where: { status: "PUBLISHED" },
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: {
                        id: true,
                        version: true,
                        endpoint: true,
                        installs: {
                            where: { workspaceId },
                            select: { id: true, status: true, installedAt: true, apiKeyEncrypted: true },
                        },
                    },
                },
            },
        })

        // Viewable if this workspace owns it (any visibility — covers
        // your own custom deploys) OR it's a public marketplace tool
        // (viewable/installable by any workspace). Blocks viewing a
        // PRIVATE tool owned by a different workspace.
        if (!tool || (tool.workspaceId !== workspaceId && tool.visibility !== "PUBLIC")) {
            return { status: 404 as const, message: "Tool not found" }
        }

        const version = tool.versions[0] ?? null
        const rawInstall = version?.installs[0] ?? null
        const deployment = tool.deployments[0] ?? null

        const data: ToolDetail = {
            id: tool.id,
            name: tool.name,
            slug: tool.slug,
            description: tool.description,
            logoUrl: tool.logoUrl,
            websiteUrl: tool.websiteUrl,
            documentationUrl: tool.documentationUrl,
            requiresAuth: tool.requiresAuth,
            usesApiKey: tool.usesApiKey,
            // This is the PUBLISHING workspace's slug (tool.workspace),
            // not necessarily the CALLING workspace's slug — that's
            // correct: buildToolEndpoint needs to reproduce the exact
            // same URL this tool was actually given when it was
            // deployed/published, which is always relative to its owning
            // workspace, regardless of who's currently viewing it.
            workspaceSlug: tool.workspace.slug,
            deployment,
            version: version ? { id: version.id, version: version.version, endpoint: version.endpoint } : null,
            install: rawInstall
                ? {
                    id: rawInstall.id,
                    status: rawInstall.status,
                    installedAt: rawInstall.installedAt,
                    hasApiKey: !!rawInstall.apiKeyEncrypted,
                }
                : null,
        }

        return { status: 200 as const, data }
    } catch (error) {
        console.error("getToolDetail error:", error)
        return { status: 500 as const, message: "Internal error fetching tool" }
    }
}