// app/.well-known/oauth-authorization-server/route.ts
//
// Step 2 of the flow: after a client reads the protected-resource
// metadata, it comes HERE to find out how to actually log in. Global —
// one authorization server for the whole platform, not per-tool.

export const dynamic = "force-static"

export async function GET() {
    const base = process.env.NEXT_PUBLIC_GATEWAY_BASE_URL
    if (!base) {
        return Response.json({ error: "NEXT_PUBLIC_GATEWAY_BASE_URL is not configured" }, { status: 500 })
    }

    return Response.json({
        issuer: base,
        authorization_endpoint: `${base}/api/oauth2/authorize`,
        token_endpoint: `${base}/api/oauth2/token`,
        registration_endpoint: `${base}/api/oauth2/register`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code"],
        code_challenge_methods_supported: ["S256"],
        // Public clients only — MCP clients can't safely hold a secret.
        // PKCE (code_challenge/code_verifier) is the real security
        // mechanism here, not a client credential.
        token_endpoint_auth_methods_supported: ["none"],
    })
}