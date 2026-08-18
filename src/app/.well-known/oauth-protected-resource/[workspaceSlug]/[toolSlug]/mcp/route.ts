// app/.well-known/oauth-protected-resource/[workspaceSlug]/[toolSlug]/mcp/route.ts
//
// Step 1 of the flow: mcp-gateway-route.ts's 401 response points here.
// Tells a client "this is the exact resource you're trying to reach, and
// here's who to go log in with."
//
// MOVED from [workspaceSlug]/[toolSlug]/.well-known/oauth-protected-resource
// — that path put .well-known AFTER the resource path
// (/tanmay-b66f72/elevenlabs/.well-known/oauth-protected-resource), which
// is backwards from RFC 9728. The spec requires .well-known/<name> to sit
// right after the domain, with the resource's own path appended after it:
//   /.well-known/oauth-protected-resource/{workspaceSlug}/{toolSlug}/mcp
// A spec-compliant client (Claude included) requests the URL in that
// order and gets a 404 against the old layout — this is what was
// actually happening in the HTTP request log.

declare const process: { env: { NEXT_PUBLIC_GATEWAY_BASE_URL?: string } }

export const dynamic = "force-dynamic"

export async function GET(
    req: Request,
    { params }: { params: Promise<{ workspaceSlug: string; toolSlug: string }> }
) {
    const { workspaceSlug, toolSlug } = await params
    const base = process.env.NEXT_PUBLIC_GATEWAY_BASE_URL
    if (!base) {
        return Response.json({ error: "NEXT_PUBLIC_GATEWAY_BASE_URL is not configured" }, { status: 500 })
    }

    return Response.json({
        resource: `${base}/${workspaceSlug}/${toolSlug}/mcp`,
        authorization_servers: [base],
    })
}