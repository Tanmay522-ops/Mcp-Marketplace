// app/[workspaceSlug]/[toolSlug]/.well-known/[...path]/route.ts
//
// Companion to mcp/route.ts's WWW-Authenticate rewriting. If a
// custom-deployed server enforces its OWN MCP-level OAuth (per the MCP
// authorization spec) and exposes discovery documents like
// /.well-known/oauth-protected-resource, an external caller needs to be
// able to fetch that document too — but the raw document will describe
// URLs on the internal Railway host, which is unreachable from outside.
// This proxies the fetch and rewrites those URLs to point back through
// this gateway instead.
//
// This is a best-effort text/URL rewrite, not a certified OAuth proxy —
// verify against whatever specific server you're actually deploying.
import { client } from "../../../../../lib/prisma"

export const dynamic = "force-dynamic"

async function proxyWellKnown(
    req: Request,
    { params }: { params: Promise<{ workspaceSlug: string; toolSlug: string; path: string[] }> }
) {
    const { workspaceSlug, toolSlug, path } = await params

    const tool = await client.tool.findFirst({
        where: { slug: toolSlug, workspace: { slug: workspaceSlug } },
        select: {
            versions: {
                where: { status: "PUBLISHED" },
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { internalHost: true },
            },
        },
    })

    const internalHost = tool?.versions[0]?.internalHost
    if (!internalHost) {
        return Response.json({ error: "server not found" }, { status: 404 })
    }

    const upstreamUrl = `https://${internalHost}/.well-known/${path.join("/")}`
    const upstream = await fetch(upstreamUrl)

    const contentType = upstream.headers.get("content-type") ?? ""
    const externalBase = `${new URL(req.url).origin}/${workspaceSlug}/${toolSlug}`

    if (contentType.includes("json")) {
        const text = await upstream.text()
        const rewritten = text.replaceAll(`https://${internalHost}`, externalBase)
        return new Response(rewritten, {
            status: upstream.status,
            headers: { "content-type": "application/json" },
        })
    }

    // Non-JSON responses (rare for these endpoints) pass through unmodified.
    return new Response(upstream.body, { status: upstream.status, headers: upstream.headers })
}

export { proxyWellKnown as GET }