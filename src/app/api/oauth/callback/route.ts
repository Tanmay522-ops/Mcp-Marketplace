// app/api/oauth/callback/route.ts
//
// The third-party provider (Sentry, Linear, whatever) redirects the user
// back here after the consent screen. Outcomes, matching the screenshots:
//   1. User cancels/denies              -> status PENDING, redirect to list
//   2. Token exchange fails (retryable) -> status PENDING, redirect to list
//   3. Token exchange fails (config/     -> status FAILED,  redirect to list
//      provider is actually broken)
//   4. Provider returns 200 but body is  -> status FAILED,  redirect to list
//      malformed/unparseable
//   5. Success                          -> status ACTIVE,  redirect to tool page
//
// GET /api/oauth/callback?code=...&state=...

import { client } from "@/lib/prisma"
import { verifyState } from "@/lib/oauth-state"
import { decryptSecret, encryptSecret } from "@/lib/tool-crypto"
import { getCallerContext } from "@/hooks/useCallerContext"
import { NextRequest, NextResponse } from "next/server"

// Shared by markPending/markFailed: finds the published version + existing
// install, and never regresses an already-ACTIVE install (e.g. a user
// re-authorizing who then cancels midway shouldn't lose a previously
// working connection).
const setInstallStatus = async (
    workspaceId: string,
    toolId: string,
    status: "PENDING" | "FAILED"
) => {
    const publishedVersion = await client.toolVersion.findFirst({
        where: { toolId, status: "PUBLISHED" },
        orderBy: { createdAt: "desc" },
    })
    if (!publishedVersion) return

    const existing = await client.installRecord.findUnique({
        where: { workspaceId_toolVersionId: { workspaceId, toolVersionId: publishedVersion.id } },
    })
    if (existing?.status === "ACTIVE") return

    await client.installRecord.update({
        where: { workspaceId_toolVersionId: { workspaceId, toolVersionId: publishedVersion.id } },
        data: { status },
    }).catch(() => {
        // install record genuinely doesn't exist yet (edge case, shouldn't
        // normally happen since installTool creates it up front)
    })
}

const markPending = (workspaceId: string, toolId: string) =>
    setInstallStatus(workspaceId, toolId, "PENDING")

const markFailed = (workspaceId: string, toolId: string) =>
    setInstallStatus(workspaceId, toolId, "FAILED")

// OAuth error codes that mean "the setup itself is broken" — retrying the
// login flow won't help, someone needs to fix the client id/secret/config.
//
// Verified so far:
//   - Linear: standard RFC 6749 shape, error code under `error`
//   - Notion: non-standard shape, same values but under `code` instead
//
// Before adding a new provider here, confirm its actual token-endpoint
// error body (not assumed from the OAuth spec) — some providers use
// different field names entirely, or don't distinguish config errors
// from retryable ones. Until verified, an unrecognized provider safely
// falls through to PENDING below — it just means FAILED won't be
// reachable for that provider until its shape is checked and added.
const CONFIG_ERROR_CODES = new Set(["invalid_client", "unauthorized_client"])

export async function GET(req: NextRequest) {
    const code = req.nextUrl.searchParams.get("code")
    const state = req.nextUrl.searchParams.get("state")
    const providerError = req.nextUrl.searchParams.get("error")

    if (!state) {
        return NextResponse.json({ error: "Missing state" }, { status: 400 })
    }
    const decoded = verifyState(state)
    if (!decoded) {
        return NextResponse.json({ error: "Invalid or expired authorization attempt — try again" }, { status: 400 })
    }
    const { workspaceId, toolId } = decoded

    // Enforce that whoever is completing this OAuth flow actually belongs
    // to the workspace embedded in the signed state — without this, any
    // authenticated user could finish the provider's consent screen with
    // their OWN third-party account and have those tokens written into an
    // arbitrary victim workspace's InstallRecord below.
    const ctx = await getCallerContext(workspaceId)
    if (ctx.error) {
        return NextResponse.json({ error: ctx.error.message }, { status: ctx.error.status })
    }

    const tool = await client.tool.findFirst({ where: { id: toolId, workspaceId } })
    if (!tool) {
        return NextResponse.json({ error: "Tool not found" }, { status: 404 })
    }
    const listUrl = new URL(`/dashboard/${workspaceId}/mcp`, req.nextUrl.origin)
    const toolUrl = new URL(`/dashboard/${workspaceId}/mcp/${toolId}`, req.nextUrl.origin)

    // --- user cancelled/denied on the provider's consent screen: retryable ---
    if (providerError) {
        await markPending(workspaceId, toolId)
        return NextResponse.redirect(listUrl)
    }

    if (!code) {
        return NextResponse.json({ error: "Missing code" }, { status: 400 })
    }
    if (!tool.requiresAuth || !tool.oauthTokenUrl || !tool.oauthClientId) {
        return NextResponse.json({ error: "Tool auth configuration is missing or was removed" }, { status: 400 })
    }

    const callbackUrl = new URL("/api/oauth/callback", req.nextUrl.origin).toString()

    let tokenRes: Response

    if (tool.usesDynamicClientRegistration) {
        // DCR path (Notion): no client secret exists for this tool at
        // all — proof of identity is the PKCE code_verifier we generated
        // back in the authorize step, carried here via the signed state.
        const codeVerifier = decoded.codeVerifier
        if (!codeVerifier) {
            // Session/state issue, not a broken tool config — retryable.
            console.error("oauth callback: DCR tool but no codeVerifier in state", toolId)
            await markPending(workspaceId, toolId)
            return NextResponse.redirect(listUrl)
        }
        tokenRes = await fetch(tool.oauthTokenUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "authorization_code",
                code,
                redirect_uri: callbackUrl,
                client_id: tool.oauthClientId,
                code_verifier: codeVerifier,
            }),
        })
    } else {
        // Classic path (Linear, unchanged): real client secret required.
        const clientSecret = tool.oauthClientSecretEnvKey
            ? process.env[tool.oauthClientSecretEnvKey]
            : tool.oauthClientSecretEncrypted
                ? decryptSecret(tool.oauthClientSecretEncrypted)
                : undefined

        if (!clientSecret) {
            // Nothing the user can do by retrying — the tool itself was
            // never configured with a secret. Genuine failure.
            console.error("oauth callback: no client secret configured for tool", toolId)
            await markFailed(workspaceId, toolId)
            return NextResponse.redirect(listUrl)
        }

        tokenRes = await fetch(tool.oauthTokenUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "authorization_code",
                code,
                redirect_uri: callbackUrl,
                client_id: tool.oauthClientId,
                client_secret: clientSecret,
            }),
        })
    }

    // --- token exchange itself failed: split retryable vs config-broken ---
    if (!tokenRes.ok) {
        const detail = await tokenRes.text().catch(() => "")
        console.error("oauth callback: token exchange failed", tokenRes.status, detail)

        let providerErrorCode: string | undefined
        try {
            const parsed = JSON.parse(detail)
            // Linear (RFC 6749-style) uses `error`; Notion uses `code` instead.
            providerErrorCode = parsed?.error ?? parsed?.code
        } catch {
            // Not JSON — leave providerErrorCode undefined, treat as retryable below.
        }

        if (providerErrorCode && CONFIG_ERROR_CODES.has(providerErrorCode)) {
            await markFailed(workspaceId, toolId)
        } else {
            // Covers invalid_grant (expired/used code), server_error,
            // temporarily_unavailable, and anything unparseable — all
            // things a fresh retry can plausibly fix.
            await markPending(workspaceId, toolId)
        }
        return NextResponse.redirect(listUrl)
    }

    // --- provider said 200 OK, but the body itself might still be broken ---
    let tokenJson: { access_token?: string; refresh_token?: string; expires_in?: number }
    try {
        tokenJson = await tokenRes.json()
    } catch (err) {
        // 200 OK with an empty body, HTML, or truncated JSON — provider's
        // fault, not something a retry fixes.
        console.error("oauth callback: token response was not valid JSON", toolId, err)
        await markFailed(workspaceId, toolId)
        return NextResponse.redirect(listUrl)
    }

    const accessToken = tokenJson.access_token
    const refreshToken = tokenJson.refresh_token
    const expiresInSeconds = tokenJson.expires_in

    if (!accessToken) {
        // Provider said "ok" but gave us nothing usable — that's the
        // provider's problem, not something a retry fixes.
        console.error("oauth callback: provider returned no access_token", toolId)
        await markFailed(workspaceId, toolId)
        return NextResponse.redirect(listUrl)
    }

    const publishedVersion = await client.toolVersion.findFirst({
        where: { toolId, status: "PUBLISHED" },
        orderBy: { createdAt: "desc" },
    })
    if (!publishedVersion) {
        return NextResponse.json({ error: "Tool has no published version to attach this install to" }, { status: 400 })
    }

    const expiresAt = expiresInSeconds ? new Date(Date.now() + expiresInSeconds * 1000) : null

    // ctx.userId is already the caller's internal User.id, resolved by
    // getCallerContext above — no need for a separate lookup here.

    // Encrypt before storing — these are a real, live third-party access
    // token and refresh token, not just our own signed state. Previously
    // stored in plaintext; encryptSecret/decryptSecret already exist and
    // are used for oauthClientSecretEncrypted on Tool, so this reuses the
    // same helper rather than introducing a second scheme.
    const encryptedAccessToken = encryptSecret(accessToken)
    const encryptedRefreshToken = refreshToken ? encryptSecret(refreshToken) : null

    // --- success ---
    await client.installRecord.upsert({
        where: { workspaceId_toolVersionId: { workspaceId, toolVersionId: publishedVersion.id } },
        update: {
            oauthAccessToken: encryptedAccessToken,
            oauthRefreshToken: encryptedRefreshToken,
            oauthExpiresAt: expiresAt,
            status: "ACTIVE",
        },
        create: {
            workspaceId,
            toolVersionId: publishedVersion.id,
            installedById: ctx.userId,
            method: "MANUAL",
            status: "ACTIVE",
            oauthAccessToken: encryptedAccessToken,
            oauthRefreshToken: encryptedRefreshToken,
            oauthExpiresAt: expiresAt,
        },
    })

    return NextResponse.redirect(toolUrl)
}