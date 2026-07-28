// app/api/oauth2/register/route.ts
//
// Step 3 of the flow: before showing a login screen, a client introduces
// itself. Simplified dynamic client registration (RFC 7591) — accepts a
// client name + redirect URIs, hands back a client_id. No client_secret,
// since MCP clients are public clients (PKCE is the real security here).

import { client } from "@/lib/prisma"
import { randomBytes } from "crypto"

export async function POST(req: Request) {
    let body: { client_name?: string; redirect_uris?: string[] }
    try {
        body = await req.json()
    } catch {
        return Response.json({ error: "invalid_client_metadata", error_description: "Malformed JSON" }, { status: 400 })
    }

    if (!body.client_name?.trim()) {
        return Response.json({ error: "invalid_client_metadata", error_description: "client_name is required" }, { status: 400 })
    }
    if (!Array.isArray(body.redirect_uris) || body.redirect_uris.length === 0) {
        return Response.json(
            { error: "invalid_redirect_uri", error_description: "redirect_uris must be a non-empty array" },
            { status: 400 }
        )
    }
    for (const uri of body.redirect_uris) {
        try {
            new URL(uri)
        } catch {
            return Response.json({ error: "invalid_redirect_uri", error_description: `Not a valid URL: ${uri}` }, { status: 400 })
        }
    }

    const clientId = randomBytes(16).toString("hex")

    const created = await client.oAuthClient.create({
        data: {
            clientId,
            clientName: body.client_name.trim(),
            redirectUris: body.redirect_uris,
        },
    })

    return Response.json(
        {
            client_id: created.clientId,
            client_name: created.clientName,
            redirect_uris: created.redirectUris,
            token_endpoint_auth_method: "none",
        },
        { status: 201 }
    )
}