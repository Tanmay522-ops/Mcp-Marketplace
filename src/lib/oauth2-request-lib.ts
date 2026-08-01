// lib/oauth2-request-lib.ts
//
// Carries an in-flight authorization request (from /api/oauth2/authorize
// to the consent page and back) without needing a temporary DB table.
// Same stateless-signed-token approach as lib/oauth-state.ts, just a
// different payload shape.

import { createHmac, randomBytes } from "crypto"
import { safeEqual } from "./safe-equal"

const REQUEST_TTL_MS = 10 * 60 * 1000

const getSecret = (): string => {
    const secret = process.env.OAUTH_STATE_SECRET
    if (!secret) throw new Error("OAUTH_STATE_SECRET is not set — generate one with `openssl rand -hex 32`")
    return secret
}

export type PendingAuthRequest = {
    clientId: string
    redirectUri: string
    codeChallenge: string
    codeChallengeMethod: string
    scope: string | null
    clientState: string | null // the CLIENT's own state param, echoed back — distinct from our signed token
    workspaceId: string
    toolId: string
}

export const signAuthRequest = (payload: PendingAuthRequest): string => {
    const body = JSON.stringify({ ...payload, nonce: randomBytes(8).toString("hex"), ts: Date.now() })
    const bodyB64 = Buffer.from(body).toString("base64url")
    const sig = createHmac("sha256", getSecret()).update(bodyB64).digest("base64url")
    return `${bodyB64}.${sig}`
}

export const verifyAuthRequest = (token: string): PendingAuthRequest | null => {
    const [bodyB64, sig] = token.split(".")
    if (!bodyB64 || !sig) return null
    const expected = createHmac("sha256", getSecret()).update(bodyB64).digest("base64url")
    if (!safeEqual(sig, expected)) return null
    try {
        const parsed = JSON.parse(Buffer.from(bodyB64, "base64url").toString("utf8"))
        if (Date.now() - parsed.ts > REQUEST_TTL_MS) return null
        return parsed
    } catch {
        return null
    }
}