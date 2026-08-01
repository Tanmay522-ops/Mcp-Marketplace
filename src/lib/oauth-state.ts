// lib/oauth-state.ts
//
// Deliberately NOT inside a route.ts file — Next.js route handlers only
// support recognized exports (GET/POST/etc + a few config constants), so
// helper functions like these belong in a plain module both the authorize
// and callback routes can import from.

import { createHmac, randomBytes } from "crypto"
import { safeEqual } from "./safe-equal"

const STATE_TTL_MS = 10 * 60 * 1000 // authorize -> callback must complete within 10 minutes

const getStateSecret = (): string => {
    const secret = process.env.OAUTH_STATE_SECRET
    if (!secret) throw new Error("OAUTH_STATE_SECRET is not set — generate one with `openssl rand -hex 32`")
    return secret
}

// Stateless signed state: no DB row needed, can't be forged or replayed
// past its TTL without knowing OAUTH_STATE_SECRET. codeVerifier is optional
// — only DCR-based tools (no client secret exists for them) need PKCE
// carried through; classic tools like Linear never pass one, unaffected.
export const signState = (payload: { workspaceId: string; toolId: string; codeVerifier?: string }): string => {
    const body = JSON.stringify({ ...payload, nonce: randomBytes(8).toString("hex"), ts: Date.now() })
    const bodyB64 = Buffer.from(body).toString("base64url")
    const sig = createHmac("sha256", getStateSecret()).update(bodyB64).digest("base64url")
    return `${bodyB64}.${sig}`
}

export const verifyState = (state: string): { workspaceId: string; toolId: string; codeVerifier?: string } | null => {
    const [bodyB64, sig] = state.split(".")
    if (!bodyB64 || !sig) return null
    const expectedSig = createHmac("sha256", getStateSecret()).update(bodyB64).digest("base64url")
    if (!safeEqual(sig, expectedSig)) return null // tampered
    try {
        const parsed = JSON.parse(Buffer.from(bodyB64, "base64url").toString("utf8"))
        if (Date.now() - parsed.ts > STATE_TTL_MS) return null // expired
        return { workspaceId: parsed.workspaceId, toolId: parsed.toolId, codeVerifier: parsed.codeVerifier }
    } catch {
        return null
    }
}