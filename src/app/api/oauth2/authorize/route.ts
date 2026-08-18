// app/api/oauth2/authorize/route.ts
//
// Step 4 of the flow: the client sends the user here. Validates
// everything about the request, figures out which workspace/tool is
// being requested (from the `resource` param), makes sure the user is
// actually logged into YOUR platform, then hands off to the consent
// screen — this route itself never shows UI.
//
// GET /api/oauth2/authorize?response_type=code&client_id=...&redirect_uri=...
//     &code_challenge=...&code_challenge_method=S256&state=...&resource=...

import { client } from "@/lib/prisma"
import { getCallerContext } from "@/hooks/useCallerContext"
import { signAuthRequest } from "@/lib/oauth2-request-lib"
import { NextRequest, NextResponse } from "next/server"

const parseResourceUrl = (resource: string): { workspaceSlug: string; toolSlug: string } | null => {
    try {
        const url = new URL(resource)
        const parts = url.pathname.split("/").filter(Boolean) // [workspaceSlug, toolSlug, "mcp"]
        if (parts.length < 2) return null
        return { workspaceSlug: parts[0], toolSlug: parts[1] }
    } catch {
        return null
    }
}

export async function GET(req: NextRequest) {
    const params = req.nextUrl.searchParams
    const responseType = params.get("response_type")
    const clientId = params.get("client_id")
    const redirectUri = params.get("redirect_uri")
    const codeChallenge = params.get("code_challenge")
    const codeChallengeMethod = params.get("code_challenge_method") ?? "S256"
    const clientState = params.get("state")
    const scope = params.get("scope")
    const resource = params.get("resource")

    if (responseType !== "code") {
        return Response.json({ error: "unsupported_response_type" }, { status: 400 })
    }
    if (!clientId || !redirectUri || !codeChallenge || !resource) {
        return Response.json({ error: "invalid_request", error_description: "Missing required parameter" }, { status: 400 })
    }
    if (codeChallengeMethod !== "S256") {
        return Response.json({ error: "invalid_request", error_description: "Only S256 code_challenge_method is supported" }, { status: 400 })
    }

    const oauthClient = await client.oAuthClient.findUnique({ where: { clientId } })
    if (!oauthClient) {
        return Response.json({ error: "invalid_client" }, { status: 400 })
    }
    if (!oauthClient.redirectUris.includes(redirectUri)) {
        return Response.json({ error: "invalid_request", error_description: "redirect_uri does not match registered value" }, { status: 400 })
    }

    const parsedResource = parseResourceUrl(resource)
    if (!parsedResource) {
        return Response.json({ error: "invalid_target", error_description: "Could not parse resource parameter" }, { status: 400 })
    }

    const tool = await client.tool.findFirst({
        where: { slug: parsedResource.toolSlug, workspace: { slug: parsedResource.workspaceSlug } },
        select: { id: true, workspaceId: true },
    })
    if (!tool) {
        return Response.json({ error: "invalid_target", error_description: "Resource does not match a known tool" }, { status: 400 })
    }

    // Require the user to actually be logged into YOUR platform first —
    // reuses the same auth/membership check every other action in this
    // codebase uses, rather than inventing a separate session check here.
    const ctx = await getCallerContext(tool.workspaceId)
    if (ctx.error) {
        // TEMPORARY DEBUG — remove once the redirect-loop cause is
        // confirmed. Prints exactly why getCallerContext rejected this
        // request: not signed in at all vs. signed in but not a
        // member/owner of tool.workspaceId (two very different problems
        // that were producing the identical "back to home" redirect).
        console.log("OAUTH AUTHORIZE — getCallerContext failed:", {
            workspaceId: tool.workspaceId,
            errorStatus: ctx.error.status,
            errorMessage: ctx.error.message,
        })
        // FIXED: was `new URL("/", req.nextUrl.origin)` — req.nextUrl.origin
        // is unreliable behind a tunnel like ngrok (it was resolving to
        // "https://localhost:3000", an origin that doesn't correspond to
        // anything reachable — https scheme from ngrok's forwarded-proto
        // header, but localhost:3000 for the host). Every other
        // discovery/metadata route in this app sidesteps this by building
        // URLs from NEXT_PUBLIC_GATEWAY_BASE_URL directly instead of
        // trusting the incoming request's own origin — matching that here.
        const base = process.env.NEXT_PUBLIC_GATEWAY_BASE_URL
        if (!base) {
            return Response.json({ error: "server_error", message: "NEXT_PUBLIC_GATEWAY_BASE_URL is not configured" }, { status: 500 })
        }
        const loginUrl = new URL("/", base)
        // FIXED: was `req.nextUrl.toString()` — same broken-origin problem
        // as loginUrl itself had (see above). This is the value that
        // matters even more: whatever reads `redirect_to` after sign-in
        // sends the browser here next, so if THIS is still built from the
        // unreliable req.nextUrl origin, the user hits the same broken
        // localhost link post-login instead of continuing the OAuth flow.
        const preservedRequestUrl = new URL(req.nextUrl.pathname + req.nextUrl.search, base)
        loginUrl.searchParams.set("redirect_to", preservedRequestUrl.toString())
        return NextResponse.redirect(loginUrl)
    }

    const pendingRequestToken: string = signAuthRequest({
        clientId,
        redirectUri,
        codeChallenge,
        codeChallengeMethod,
        scope,
        clientState,
        workspaceId: tool.workspaceId,
        toolId: tool.id,
    })

    // Same fix as the login redirect above — don't trust req.nextUrl.origin.
    const base = process.env.NEXT_PUBLIC_GATEWAY_BASE_URL
    if (!base) {
        return Response.json({ error: "server_error", message: "NEXT_PUBLIC_GATEWAY_BASE_URL is not configured" }, { status: 500 })
    }
    const consentUrl = new URL("/oauth2/consent", base)
    consentUrl.searchParams.set("request", pendingRequestToken)
    return NextResponse.redirect(consentUrl)
}