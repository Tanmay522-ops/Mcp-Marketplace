// lib/tool-crypto.ts
//
// Deliberately NOT a "use server" file — "use server" files may only
// export async functions (this is what broke maxDuration earlier), and
// encryptSecret/decryptSecret are plain synchronous crypto operations.
// These are called server-side (from route handlers and server actions)
// but never need the client RPC bridge themselves.

import { createCipheriv, createDecipheriv, randomBytes } from "crypto"
import { client } from "@/lib/prisma"

// --- encryption helpers -------------------------------------------------
// Baseline AES-256-GCM encryption using a single server-held key. This is
// NOT a substitute for a real secrets manager (AWS Secrets Manager, GCP
// Secret Manager, HashiCorp Vault) — it's the minimum viable protection so
// a plaintext OAuth client secret never sits in the database. Rotate
// ENCRYPTION_KEY through a real KMS before this handles anything you'd
// call production-sensitive.

const getEncryptionKey = (): Buffer => {
    const key = process.env.ENCRYPTION_KEY
    if (!key) {
        throw new Error(
            "ENCRYPTION_KEY is not set — generate one with `openssl rand -hex 32` and add it to .env"
        )
    }
    const buf = Buffer.from(key, "hex")
    if (buf.length !== 32) {
        throw new Error("ENCRYPTION_KEY must be a 32-byte (64 hex character) value")
    }
    return buf
}

export const encryptSecret = (plaintext: string): string => {
    const key = getEncryptionKey()
    const iv = randomBytes(12) // GCM standard nonce size
    const cipher = createCipheriv("aes-256-gcm", key, iv)
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
    const authTag = cipher.getAuthTag()
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`
}

export const decryptSecret = (stored: string): string => {
    const key = getEncryptionKey()
    const [ivHex, authTagHex, dataHex] = stored.split(":")
    if (!ivHex || !authTagHex || !dataHex) {
        throw new Error("Malformed encrypted secret")
    }
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"))
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"))
    return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8")
}

// --- outbound token for calling the tool's own third-party API ---------
// Used by the gateway route when forwarding a request to a custom-deployed
// server that itself needs to call e.g. Notion/Slack on the user's behalf.
// Refreshes automatically if the stored access token is expired (or about
// to be) and a refresh token is available.

type OutboundTokenTool = {
    oauthTokenUrl: string | null
    oauthClientId: string | null
    oauthClientSecretEnvKey: string | null
    oauthClientSecretEncrypted: string | null
}
type OutboundTokenInstall = {
    id: string
    oauthAccessToken: string | null
    oauthRefreshToken: string | null
    oauthExpiresAt: Date | null
}

const EXPIRY_BUFFER_MS = 60 * 1000 // treat a token as expired 60s early to avoid races

export const getFreshOutboundToken = async (
    tool: OutboundTokenTool,
    install: OutboundTokenInstall
): Promise<string | null> => {
    if (!install.oauthAccessToken) return null

    // Stored encrypted since the oauth callback route was updated to
    // encrypt these on write — decrypt before use. A malformed/undecryptable
    // value (e.g. leftover plaintext from before this change, or a key
    // rotation) is treated as "no usable token" rather than throwing and
    // taking down the whole gateway request.
    let decryptedAccessToken: string
    try {
        decryptedAccessToken = decryptSecret(install.oauthAccessToken)
    } catch (error) {
        console.error("getFreshOutboundToken: failed to decrypt stored access token", install.id, error)
        return null
    }

    const stillValid = !install.oauthExpiresAt || install.oauthExpiresAt.getTime() - EXPIRY_BUFFER_MS > Date.now()
    if (stillValid) return decryptedAccessToken

    if (!install.oauthRefreshToken || !tool.oauthTokenUrl || !tool.oauthClientId) {
        return null // expired, nothing we can do about it
    }

    let decryptedRefreshToken: string
    try {
        decryptedRefreshToken = decryptSecret(install.oauthRefreshToken)
    } catch (error) {
        console.error("getFreshOutboundToken: failed to decrypt stored refresh token", install.id, error)
        return null
    }

    const clientSecret = tool.oauthClientSecretEnvKey
        ? process.env[tool.oauthClientSecretEnvKey]
        : tool.oauthClientSecretEncrypted
            ? decryptSecret(tool.oauthClientSecretEncrypted)
            : undefined
    if (!clientSecret) return null

    try {
        const res = await fetch(tool.oauthTokenUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "refresh_token",
                refresh_token: decryptedRefreshToken,
                client_id: tool.oauthClientId,
                client_secret: clientSecret,
            }),
        })
        if (!res.ok) return null

        const json = await res.json()
        const newAccessToken: string | undefined = json.access_token
        const newRefreshToken: string | undefined = json.refresh_token
        const expiresInSeconds: number | undefined = json.expires_in
        if (!newAccessToken) return null

        await client.installRecord.update({
            where: { id: install.id },
            data: {
                oauthAccessToken: encryptSecret(newAccessToken),
                oauthRefreshToken: newRefreshToken ? encryptSecret(newRefreshToken) : install.oauthRefreshToken,
                oauthExpiresAt: expiresInSeconds ? new Date(Date.now() + expiresInSeconds * 1000) : null,
            },
        })

        return newAccessToken
    } catch (error) {
        console.error("getFreshOutboundToken: refresh failed", error)
        return null
    }
}