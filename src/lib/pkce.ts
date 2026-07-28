// lib/pkce.ts
//
// PKCE (Proof Key for Code Exchange): the client generates a random
// `code_verifier`, sends its hash (`code_challenge`) when starting the
// login, then must present the original `code_verifier` when redeeming
// the code. Only the real client that started the flow has it — stops
// someone who intercepts the authorization code mid-flight from using it.

import { createHash } from "crypto"

export const verifyPkce = (codeVerifier: string, codeChallenge: string): boolean => {
    const computed = createHash("sha256").update(codeVerifier).digest("base64url")
    return computed === codeChallenge
}