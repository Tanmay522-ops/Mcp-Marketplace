// lib/dynamic-client-registration.ts
//
// Confirmed directly against Notion's own developer docs
// (developers.notion.com/guides/mcp/build-mcp-client) — this is standard
// OAuth Dynamic Client Registration (RFC 7591), NOT the URL-as-client-id
// pattern (CIMD) discussed earlier and abandoned. No file needs to be
// hosted anywhere; this is a live discovery + registration handshake done
// once, with the result cached.
//
// Reuses the SAME Tool fields classic (Linear-style) registration uses —
// oauthAuthorizeUrl, oauthTokenUrl, oauthClientId — just populated
// dynamically instead of by a one-off script. oauthClientSecretEncrypted
// stays null for these: DCR issues public clients, secured by PKCE alone,
// never a secret.

import { client } from "@/lib/prisma"

type ProtectedResourceMetadata = { authorization_servers?: string[] }
type AuthServerMetadata = {
    authorization_endpoint?: string
    token_endpoint?: string
    registration_endpoint?: string
}

// Runs the full discovery + registration handshake and saves the result.
// Safe to call every time — it short-circuits immediately if this tool
// already has a cached oauthClientId, so registration only actually
// happens once, ever, per tool.
export const ensureDynamicClientRegistered = async (
    toolId: string
): Promise<{ authorizeUrl: string; tokenUrl: string; clientId: string } | { error: string }> => {
    const tool = await client.tool.findUnique({ where: { id: toolId } })
    if (!tool) return { error: "Tool not found" }

    // Already registered — nothing to do.
    if (tool.oauthClientId && tool.oauthAuthorizeUrl && tool.oauthTokenUrl) {
        return { authorizeUrl: tool.oauthAuthorizeUrl, tokenUrl: tool.oauthTokenUrl, clientId: tool.oauthClientId }
    }

    const version = await client.toolVersion.findFirst({
        where: { toolId, status: "PUBLISHED" },
        orderBy: { createdAt: "desc" },
    })
    if (!version) return { error: "No published version to discover an authorization server for" }

    // Step 1: "how do I even reach your login system?"
    // Confirmed exact path from Notion's own docs: appended directly after
    // the real endpoint, not stripped down to a bare domain.
    const resourceRes = await fetch(`${version.endpoint}/.well-known/oauth-protected-resource`)
    if (!resourceRes.ok) return { error: "Failed to fetch protected resource metadata" }
    const resourceMeta: ProtectedResourceMetadata = await resourceRes.json()

    const authServerUrl = resourceMeta.authorization_servers?.[0]
    if (!authServerUrl) return { error: "No authorization server advertised by this endpoint" }

    // Step 2: "okay, and what are your actual login rules?"
    const authServerRes = await fetch(`${authServerUrl}/.well-known/oauth-authorization-server`)
    if (!authServerRes.ok) return { error: "Failed to fetch authorization server metadata" }
    const authServerMeta: AuthServerMetadata = await authServerRes.json()

    const { authorization_endpoint, token_endpoint, registration_endpoint } = authServerMeta
    if (!authorization_endpoint || !token_endpoint || !registration_endpoint) {
        return { error: "Authorization server does not advertise the endpoints DCR needs" }
    }

    // Step 3: register, right now, automatically — no human, no dashboard.
    const gatewayBase = process.env.NEXT_PUBLIC_GATEWAY_BASE_URL
    if (!gatewayBase) return { error: "NEXT_PUBLIC_GATEWAY_BASE_URL is not set" }

    const registerRes = await fetch(registration_endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            client_name: process.env.NEXT_PUBLIC_PLATFORM_NAME ?? "TODO_YOUR_PLATFORM_NAME_HERE",
            redirect_uris: [`${gatewayBase}/api/oauth/callback`],
        }),
    })
    if (!registerRes.ok) return { error: "Dynamic client registration was rejected" }
    const registered = await registerRes.json()
    const clientId: string | undefined = registered.client_id
    if (!clientId) return { error: "Registration succeeded but returned no client_id" }

    // Cache the result so every future login for this tool skips
    // discovery + registration entirely and goes straight to login.
    await client.tool.update({
        where: { id: toolId },
        data: {
            oauthAuthorizeUrl: authorization_endpoint,
            oauthTokenUrl: token_endpoint,
            oauthClientId: clientId,
        },
    })

    return { authorizeUrl: authorization_endpoint, tokenUrl: token_endpoint, clientId }
}