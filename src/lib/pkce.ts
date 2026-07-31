// lib/pkce.ts
//
// PKCE (Proof Key for Code Exchange): the client generates a random
// `code_verifier`, sends its hash (`code_challenge`) when starting the
// login, then must present the original `code_verifier` when redeeming
// the code. Only the real client that started the flow has it — stops
// someone who intercepts the authorization code mid-flight from using it.

import { createHash, randomBytes } from "crypto"

export const verifyPkce = (codeVerifier: string, codeChallenge: string): boolean => {
    const computed = createHash("sha256").update(codeVerifier).digest("base64url")
    return computed === codeChallenge
}

// The opposite role from verifyPkce above: here OUR platform is the client,
// talking to a third party (e.g. Notion) that uses Dynamic Client
// Registration — no client secret exists for these, so PKCE is the only
// proof we're the same client that started the login. Generate once per
// login attempt; the verifier must be carried through to the callback
// (via signed state) since it's needed again at token exchange.
export const generatePkcePair = (): { codeVerifier: string; codeChallenge: string } => {
    const codeVerifier = randomBytes(32).toString("base64url")
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url")
    return { codeVerifier, codeChallenge }
}