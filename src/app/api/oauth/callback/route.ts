// app/api/oauth/callback/route.ts
//
// The third-party provider (Sentry, Linear, whatever) redirects the user
// back here after the consent screen. Three outcomes, three different
// results — matching the screenshots exactly:
//   1. User cancels/denies      -> status PENDING, redirect to the list page
//   2. Token exchange fails     -> status PENDING, redirect to the list page
//   3. Success                  -> status ACTIVE,  redirect to the tool page
//
// GET /api/oauth/callback?code=...&state=...

import { client } from "@/lib/prisma"
import { verifyState } from "@/lib/oauth-state"
import { decryptSecret } from "@/lib/tool-crypto"
import { NextRequest, NextResponse } from "next/server"

// Marks the install PENDING without ever regressing an already-ACTIVE
// install back down (e.g. a user re-authorizing who then cancels midway
// shouldn't lose a previously-working connection).
const markPending = async (workspaceId: string, toolId: string) => {
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
        data: { status: "PENDING" },
    }).catch(() => {
        // install record genuinely doesn't exist yet (edge case, shouldn't
        // normally happen since installMarketplaceTool creates it up front)
    })
}

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

    const tool = await client.tool.findFirst({ where: { id: toolId, workspaceId } })
    if (!tool) {
        return NextResponse.json({ error: "Tool not found" }, { status: 404 })
    }
    const listUrl = new URL(`/dashboard/${workspaceId}/mcp`, req.nextUrl.origin)
    const toolUrl = new URL(`/dashboard/${workspaceId}/mcp/${tool.slug}`, req.nextUrl.origin)

    // --- outcome 1: user cancelled/denied on the provider's consent screen ---
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

    const clientSecret = tool.oauthClientSecretEnvKey
        ? process.env[tool.oauthClientSecretEnvKey]
        : tool.oauthClientSecretEncrypted
            ? decryptSecret(tool.oauthClientSecretEncrypted)
            : undefined

    if (!clientSecret) {
        console.error("oauth callback: no client secret configured for tool", toolId)
        await markPending(workspaceId, toolId)
        return NextResponse.redirect(listUrl)
    }

    const callbackUrl = new URL("/api/oauth/callback", req.nextUrl.origin).toString()

    const tokenRes = await fetch(tool.oauthTokenUrl, {
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

    // --- outcome 2: token exchange itself failed ---
    if (!tokenRes.ok) {
        const detail = await tokenRes.text().catch(() => "")
        console.error("oauth callback: token exchange failed", tokenRes.status, detail)
        await markPending(workspaceId, toolId)
        return NextResponse.redirect(listUrl)
    }

    const tokenJson = await tokenRes.json()
    const accessToken: string | undefined = tokenJson.access_token
    const refreshToken: string | undefined = tokenJson.refresh_token
    const expiresInSeconds: number | undefined = tokenJson.expires_in

    if (!accessToken) {
        console.error("oauth callback: provider returned no access_token", toolId)
        await markPending(workspaceId, toolId)
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

    // NOTE: installedById needs the actual signed-in user's id from your
    // session/auth helper (e.g. Clerk) — wire that in before this runs for
    // real. The `create` branch below is really just a defensive fallback;
    // installMarketplaceTool should already have created this record.
    const currentUserId = "" // TODO: replace with real session user id

    // --- outcome 3: success ---
    await client.installRecord.upsert({
        where: { workspaceId_toolVersionId: { workspaceId, toolVersionId: publishedVersion.id } },
        update: {
            oauthAccessToken: accessToken,
            oauthRefreshToken: refreshToken ?? null,
            oauthExpiresAt: expiresAt,
            status: "ACTIVE",
        },
        create: {
            workspaceId,
            toolVersionId: publishedVersion.id,
            installedById: currentUserId,
            method: "MANUAL",
            status: "ACTIVE",
            oauthAccessToken: accessToken,
            oauthRefreshToken: refreshToken ?? null,
            oauthExpiresAt: expiresAt,
        },
    })

    return NextResponse.redirect(toolUrl)
}