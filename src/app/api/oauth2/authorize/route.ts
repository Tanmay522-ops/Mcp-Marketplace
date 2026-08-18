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
        // FIXED: was `new URL("/login", ...)` — that route doesn't exist
        // anywhere in this app (sign-in is modal-based, triggered from
        // the home page, not a dedicated page route). Redirecting there
        // was a genuine dead end — a 404 for anyone hitting an external
        // MCP client's auth flow while signed out.
        //
        // Sending to "/" with redirect_to preserved, same as before —
        // but this assumes the home page/root layout actually reads
        // redirect_to and opens the sign-in modal + redirects onward
        // after a successful login. CONFIRM THIS ASSUMPTION: if the home
        // page doesn't already do that, this redirect still dead-ends
        // (silently, not as a 404 — arguably worse, since it looks like
        // it worked). If there's a different real entry point for
        // triggering sign-in in this app, swap the path below for that
        // instead.
        const loginUrl = new URL("/", req.nextUrl.origin)
        loginUrl.searchParams.set("redirect_to", req.nextUrl.toString())
        return NextResponse.redirect(loginUrl)
    }

    const pendingRequestToken = signAuthRequest({
        clientId,
        redirectUri,
        codeChallenge,
        codeChallengeMethod,
        scope,
        clientState,
        workspaceId: tool.workspaceId,
        toolId: tool.id,
    })

    const consentUrl = new URL("/oauth2/consent", req.nextUrl.origin)
    consentUrl.searchParams.set("request", pendingRequestToken)
    return NextResponse.redirect(consentUrl)
}