// app/api/oauth/authorize/route.ts
//
// Entry point for the "Authorize to connect" button. Redirects the user to
// the TOOL's third-party OAuth provider (Asana, Notion, whatever the
// deployer configured) — not an OAuth server we run ourselves.
//
// GET /api/oauth/authorize?workspaceId=...&toolId=...

import { client } from "@/lib/prisma"
import { signState } from "@/lib/oauth-state"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
    const workspaceId = req.nextUrl.searchParams.get("workspaceId")
    const toolId = req.nextUrl.searchParams.get("toolId")

    if (!workspaceId || !toolId) {
        return NextResponse.json({ error: "workspaceId and toolId are required" }, { status: 400 })
    }

    const tool = await client.tool.findFirst({ where: { id: toolId, workspaceId } })
    if (!tool) {
        return NextResponse.json({ error: "Tool not found in this workspace" }, { status: 404 })
    }
    if (!tool.requiresAuth || !tool.oauthAuthorizeUrl || !tool.oauthClientId) {
        return NextResponse.json({ error: "This tool has no OAuth configuration" }, { status: 400 })
    }

    const callbackUrl = new URL("/api/oauth/callback", req.nextUrl.origin).toString()
    const state = signState({ workspaceId, toolId })

    const authorizeUrl = new URL(tool.oauthAuthorizeUrl)
    authorizeUrl.searchParams.set("response_type", "code")
    authorizeUrl.searchParams.set("client_id", tool.oauthClientId)
    authorizeUrl.searchParams.set("redirect_uri", callbackUrl)
    authorizeUrl.searchParams.set("state", state)
    if (tool.oauthScopes) authorizeUrl.searchParams.set("scope", tool.oauthScopes)

    return NextResponse.redirect(authorizeUrl.toString())
}