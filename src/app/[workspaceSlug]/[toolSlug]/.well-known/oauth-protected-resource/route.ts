// app/[workspaceSlug]/[toolSlug]/.well-known/oauth-protected-resource/route.ts
//
// Step 1 of the flow: mcp-gateway-route.ts's 401 response points here.
// Tells a client "this is the exact resource you're trying to reach, and
// here's who to go log in with."

// Minimal declaration to satisfy TypeScript in environments without Node types
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