// app/[workspaceSlug]/[toolSlug]/mcp/route.ts

import { client } from "@/lib/prisma"
import { getFreshOutboundToken } from "@/lib/tool-crypto"
import { decryptSecret } from "@/lib/tool-crypto"
import { createHash } from "crypto"
import { NextRequest } from "next/server"

export const dynamic = "force-dynamic"
export const maxDuration = 300

type OutboundInstallInfo = {
    id: string
    oauthAccessToken: string | null
    oauthRefreshToken: string | null
    oauthExpiresAt: Date | null
    apiKeyEncrypted: string | null
} | null

async function proxy(req: NextRequest, { params }: { params: Promise<{ workspaceSlug: string; toolSlug: string }> }) {
    const { workspaceSlug, toolSlug } = await params

    const tool = await client.tool.findFirst({
        where: { slug: toolSlug, workspace: { slug: workspaceSlug } },
        select: {
            id: true,
            requiresAuth: true,
            oauthTokenUrl: true,
            oauthClientId: true,
            oauthClientSecretEnvKey: true,
            oauthClientSecretEncrypted: true,
            usesApiKey: true,
            apiKeyHeaderName: true,
            versions: {
                where: { status: "PUBLISHED" },
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { id: true, internalHost: true },
            },
        },
    })

    const internalHost = tool?.versions[0]?.internalHost
    const publishedVersionId = tool?.versions[0]?.id
    if (!tool || !internalHost) {
        return Response.json({ error: "server not found" }, { status: 404 })
    }

    const unauthorized = (message: string) => {
        // Points at the discovery metadata — a spec-compliant client
        // follows this to find out how to actually log in (Way 2). Way 1
        // (the static per-install key) has been fully retired — this is
        // now the only path in.
        const resourceMetadataUrl = `${req.nextUrl.origin}/${workspaceSlug}/${toolSlug}/.well-known/oauth-protected-resource`
        return Response.json(
            { error: "unauthorized", message },
            { status: 401, headers: { "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadataUrl}"` } }
        )
    }

    // --- auth gate: is the CALLER allowed to reach this tool at all? ---
    const authHeader = req.headers.get("authorization")
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null

    if (!token) {
        return unauthorized("Authenticate via OAuth to obtain a Bearer token.")
    }

    const tokenHash = createHash("sha256").update(token).digest("hex")

    const mcpToken = await client.mcpAccessToken.findFirst({
        where: { tokenHash, revoked: false, toolId: tool.id, expiresAt: { gt: new Date() } },
        select: { workspaceId: true },
    })

    if (!mcpToken) {
        return unauthorized("Invalid, expired, or revoked access token.")
    }

    let outboundInstall: OutboundInstallInfo = null
    if (publishedVersionId) {
        outboundInstall = await client.installRecord.findUnique({
            where: { workspaceId_toolVersionId: { workspaceId: mcpToken.workspaceId, toolVersionId: publishedVersionId } },
            select: { id: true, oauthAccessToken: true, oauthRefreshToken: true, oauthExpiresAt: true, apiKeyEncrypted: true },
        })
        // A valid OAuth token with no matching InstallRecord is still a
        // valid CALLER — just means situation A (outbound token) has
        // nothing to forward, which is fine if tool.requiresAuth is false.
    }

    // --- situation A: does the deployed server itself need to call a ---
    // --- third-party API (Notion/Slack/etc) on the caller's behalf?   ---
    let outboundHeader: [string, string] | null = null
    if (tool.requiresAuth) {
        if (!outboundInstall) {
            return Response.json(
                { error: "reauthorization_required", message: "This workspace hasn't connected this tool's third-party account yet." },
                { status: 401 }
            )
        }
        const outboundToken = await getFreshOutboundToken(tool, outboundInstall)
        if (!outboundToken) {
            return Response.json(
                { error: "reauthorization_required", message: "This tool's connection to its third-party service has expired or was never completed." },
                { status: 401 }
            )
        }
        outboundHeader = ["X-Upstream-Token", outboundToken]
    }

    // --- situation A2: same idea, but for a static-API-key tool ---
    // (e.g. ElevenLabs) instead of an OAuth-connected one. Mutually
    // exclusive with situation A in practice — a tool is either
    // requiresAuth (OAuth) or usesApiKey, not both.
    if (tool.usesApiKey) {
        if (!outboundInstall?.apiKeyEncrypted) {
            return Response.json(
                { error: "reauthorization_required", message: "This workspace hasn't connected an API key for this tool yet." },
                { status: 401 }
            )
        }
        const apiKey = decryptSecret(outboundInstall.apiKeyEncrypted)
        const headerName = tool.apiKeyHeaderName || "Authorization"
        const headerValue = headerName.toLowerCase() === "authorization" ? `Bearer ${apiKey}` : apiKey
        outboundHeader = [headerName, headerValue]
    }

    // --- proxy the request through to Railway's internal domain ---
    const upstreamUrl = `https://${internalHost}${req.nextUrl.pathname.replace(`/${workspaceSlug}/${toolSlug}/mcp`, "") || ""}${req.nextUrl.search}`

    const forwardHeaders = stripHopByHopHeaders(req.headers)
    if (outboundHeader) forwardHeaders.set(outboundHeader[0], outboundHeader[1])

    const upstream = await fetch(upstreamUrl, {
        method: req.method,
        headers: forwardHeaders,
        body: req.method !== "GET" && req.method !== "HEAD" ? await req.arrayBuffer() : undefined,
        redirect: "manual",
    })

    // --- situation B: the deployed server enforces ITS OWN MCP-level  ---
    // --- OAuth and just told us so — rewrite its internal-host pointer ---
    const responseHeaders = new Headers(upstream.headers)
    const wwwAuth = responseHeaders.get("www-authenticate")
    if (upstream.status === 401 && wwwAuth?.includes(internalHost)) {
        const externalBase = `${req.nextUrl.origin}/${workspaceSlug}/${toolSlug}`
        responseHeaders.set("www-authenticate", wwwAuth.replaceAll(`https://${internalHost}`, externalBase))
    }

    return new Response(upstream.body, {
        status: upstream.status,
        headers: responseHeaders,
    })
}

function stripHopByHopHeaders(headers: Headers) {
    const out = new Headers(headers)
    out.delete("host")
    out.delete("connection")
    out.delete("authorization") // don't forward the gateway's own credential upstream
    out.delete("keep-alive")
    out.delete("te")
    out.delete("trailer")
    out.delete("transfer-encoding")
    out.delete("upgrade")
    return out
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as DELETE, proxy as PATCH }