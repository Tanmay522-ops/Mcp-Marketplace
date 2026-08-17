// app/api/oauth/authorize/route.ts
//
// Entry point for the "Authorize to connect" button. Redirects the user to
// the TOOL's third-party OAuth provider — either the classic pre-registered
// path (Linear: you registered an app ahead of time, has a client secret),
// or Dynamic Client Registration (Notion: registers itself automatically,
// no secret, PKCE instead). Which path a tool uses is decided entirely by
// tool.usesDynamicClientRegistration — nothing else about this route
// changes for classic tools when that flag is false.
//
// GET /api/oauth/authorize?workspaceId=...&toolId=...

import { client } from "@/lib/prisma"
import { getCallerContext } from "@/hooks/useCallerContext"
import { signState } from "@/lib/oauth-state"
import { generatePkcePair } from "@/lib/pkce"

import { NextRequest, NextResponse } from "next/server"
import { ensureDynamicClientRegistered } from "@/lib/dynamic-clinet-registration"

export async function GET(req: NextRequest) {
    const workspaceId = req.nextUrl.searchParams.get("workspaceId")
    const toolId = req.nextUrl.searchParams.get("toolId")

    if (!workspaceId || !toolId) {
        return NextResponse.json({ error: "workspaceId and toolId are required" }, { status: 400 })
    }

    // Confirm the caller actually belongs to this workspace before doing
    // anything else — without this, any authenticated user could start
    // this flow with someone else's workspaceId, complete the provider's
    // consent screen with their OWN third-party account, and have those
    // tokens land in a victim workspace's InstallRecord via the callback.
    const ctx = await getCallerContext(workspaceId)
    if (ctx.error) {
        return NextResponse.json({ error: ctx.error.message }, { status: ctx.error.status })
    }

    // Deliberately NOT scoped by workspaceId — same bug class already
    // fixed in getToolDetail/uninstallTool: a marketplace tool's Tool row
    // is owned by whichever workspace originally published it, not by
    // every workspace that installed it. A brand-new workspace
    // authorizing an existing public tool (e.g. Linear) would 404 here
    // otherwise, even though it clearly has that tool installed.
    const tool = await client.tool.findUnique({ where: { id: toolId } })
    if (!tool || (tool.workspaceId !== workspaceId && tool.visibility !== "PUBLIC")) {
        return NextResponse.json({ error: "Tool not found" }, { status: 404 })
    }
    if (!tool.requiresAuth) {
        return NextResponse.json({ error: "This tool has no OAuth configuration" }, { status: 400 })
    }

    const callbackUrl = new URL("/api/oauth/callback", req.nextUrl.origin).toString()

    let authorizeUrlBase: string
    let clientId: string
    let codeVerifier: string | undefined
    let codeChallenge: string | undefined
    let isClassicPath = false

    if (tool.usesDynamicClientRegistration) {
        // DCR path (Notion): discover + register on first use, cached
        // after that — see lib/dynamic-client-registration.ts. No client
        // secret exists for this path; PKCE is the proof instead.
        const registration = await ensureDynamicClientRegistered(tool.id, callbackUrl)
        if ("error" in registration) {
            return NextResponse.json({ error: registration.error }, { status: 400 })
        }
        authorizeUrlBase = registration.authorizeUrl
        clientId = registration.clientId
        const pkce = generatePkcePair()
        codeVerifier = pkce.codeVerifier
        codeChallenge = pkce.codeChallenge
    } else {
        // Classic path (Linear, unchanged): pre-registered, has a secret.
        if (!tool.oauthAuthorizeUrl || !tool.oauthClientId) {
            return NextResponse.json({ error: "This tool has no OAuth configuration" }, { status: 400 })
        }
        authorizeUrlBase = tool.oauthAuthorizeUrl
        clientId = tool.oauthClientId
        isClassicPath = true
    }

    const state = signState({ workspaceId, toolId, codeVerifier })

    const authorizeUrl = new URL(authorizeUrlBase)
    authorizeUrl.searchParams.set("response_type", "code")
    authorizeUrl.searchParams.set("client_id", clientId)
    authorizeUrl.searchParams.set("redirect_uri", callbackUrl)
    authorizeUrl.searchParams.set("state", state)
    if (tool.oauthScopes) authorizeUrl.searchParams.set("scope", tool.oauthScopes)
    // Default to forcing the provider's consent screen every time, for
    // every classic OAuth tool — not just Linear. Without this, most
    // OAuth providers silently skip consent on repeat authorizations once
    // a user has approved once, which makes re-authenticating/reconnecting
    // look like nothing happened. Confirmed this is a real, documented
    // param for Linear specifically; assumed (not individually verified)
    // to be supported the same way for other classic providers, since
    // `prompt=consent` is a common OAuth2/OIDC convention, not a Linear-
    // specific one. Set BEFORE the extraParams loop below so a tool's own
    // oauthExtraAuthorizeParams can still override this if a specific
    // provider ever needs something different (e.g. doesn't support
    // `prompt` at all, or uses a different param name for the same idea).
    if (isClassicPath) {
        authorizeUrl.searchParams.set("prompt", "consent")
    }
    if (codeChallenge) {
        authorizeUrl.searchParams.set("code_challenge", codeChallenge)
        authorizeUrl.searchParams.set("code_challenge_method", "S256")
    }

    // Generic escape hatch for providers that need non-standard params on
    // the authorize request (e.g. Notion's CLASSIC endpoint required
    // owner=user — not relevant to the DCR path above, but kept for any
    // future provider that needs something similarly nonstandard).
    const extraParams = tool.oauthExtraAuthorizeParams as Record<string, string> | null
    if (extraParams) {
        for (const [key, value] of Object.entries(extraParams)) {
            authorizeUrl.searchParams.set(key, value)
        }
    }

    return NextResponse.redirect(authorizeUrl.toString())
}