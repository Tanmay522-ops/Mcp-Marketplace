// lib/tool-endpoint.ts
//
// The single source of truth for "what is this tool's public endpoint
// URL." Previously this formula only existed inline inside
// pollDeploymentStatus (deploy.ts) — meaning it only ever ran
// automatically for custom Railway deploys. Any other tool (marketplace/
// OAuth tools like Linear, or a seed script for something like
// ElevenLabs) had no shared way to compute the same URL — they either
// went without an endpoint or had one hand-typed in, with no guarantee
// it actually matched the real gateway convention.

export type BuildToolEndpointResult =
    | { endpoint: string; usedGatewayBase: true }
    | { endpoint: string; usedGatewayBase: false; warning: string }

// workspaceSlug/toolSlug -> the real, routable public URL for that tool,
// via this app's own gateway proxy (see
// src/app/[workspaceSlug]/[toolSlug]/mcp/route.ts, which is what
// actually serves requests sent to this URL).
//
// fallbackHost (optional) is used only when NEXT_PUBLIC_GATEWAY_BASE_URL
// isn't configured — e.g. a raw Railway domain for a custom deploy. Not
// meaningful for a marketplace tool with no deployment; omit it there.
export const buildToolEndpoint = (
    workspaceSlug: string,
    toolSlug: string,
    fallbackHost?: string | null
): BuildToolEndpointResult => {
    const gatewayBase = process.env.NEXT_PUBLIC_GATEWAY_BASE_URL

    if (gatewayBase) {
        return {
            endpoint: `${gatewayBase}/${workspaceSlug}/${toolSlug}/mcp`,
            usedGatewayBase: true,
        }
    }

    const warning =
        "buildToolEndpoint: NEXT_PUBLIC_GATEWAY_BASE_URL is not set — falling back to a raw host, which the gateway proxy will NOT route through workspace/tool slugs."

    return {
        endpoint: fallbackHost ? `https://${fallbackHost}` : "",
        usedGatewayBase: false,
        warning,
    }
}