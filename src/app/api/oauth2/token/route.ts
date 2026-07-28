// app/api/oauth2/token/route.ts
//
// Step 6 of the flow: the client trades its one-time authorization code
// for a real, working access token — proving via PKCE that it's the same
// client that started the request.
//
// POST /api/oauth2/token
// Content-Type: application/x-www-form-urlencoded
// grant_type=authorization_code&code=...&redirect_uri=...&client_id=...&code_verifier=...

import { randomBytes, createHash } from "crypto"
import { client } from "@/lib/prisma"
import { verifyPkce } from "@/lib/pkce"

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60 // 1 hour — short-lived by design; no refresh tokens in this version, client just re-runs the flow

export async function POST(req: Request) {
    const contentType = req.headers.get("content-type") ?? ""
    if (!contentType.includes("application/x-www-form-urlencoded")) {
        return Response.json({ error: "invalid_request", error_description: "Expected form-encoded body" }, { status: 400 })
    }

    const form = new URLSearchParams(await req.text())
    const grantType = form.get("grant_type")
    const code = form.get("code")
    const redirectUri = form.get("redirect_uri")
    const clientId = form.get("client_id")
    const codeVerifier = form.get("code_verifier")

    if (grantType !== "authorization_code") {
        return Response.json({ error: "unsupported_grant_type" }, { status: 400 })
    }
    if (!code || !redirectUri || !clientId || !codeVerifier) {
        return Response.json({ error: "invalid_request", error_description: "Missing required parameter" }, { status: 400 })
    }

    const authCode = await client.authorizationCode.findUnique({ where: { code } })

    // Every failure below intentionally returns the same generic
    // "invalid_grant" error — doesn't leak WHICH check failed, standard
    // practice for token endpoints.
    const reject = () => Response.json({ error: "invalid_grant" }, { status: 400 })

    if (!authCode) return reject()
    if (authCode.used) return reject()
    if (authCode.expiresAt < new Date()) return reject()
    if (authCode.clientId !== clientId) return reject()
    if (authCode.redirectUri !== redirectUri) return reject()
    if (!verifyPkce(codeVerifier, authCode.codeChallenge)) return reject()

    // Single-use: mark it consumed in the same breath as issuing the
    // token, so a retried/replayed request with the same code fails.
    await client.authorizationCode.update({ where: { code }, data: { used: true } })

    const accessToken = randomBytes(32).toString("hex")
    const tokenHash = createHash("sha256").update(accessToken).digest("hex")

    await client.mcpAccessToken.create({
        data: {
            tokenHash,
            clientId: authCode.clientId,
            workspaceId: authCode.workspaceId,
            toolId: authCode.toolId,
            scope: authCode.scope,
            expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000),
        },
    })

    return Response.json({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: ACCESS_TOKEN_TTL_SECONDS,
        scope: authCode.scope ?? undefined,
    })
}