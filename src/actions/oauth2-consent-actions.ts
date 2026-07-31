"use server"

import { randomBytes } from "crypto"
import { client } from "@/lib/prisma"
import { getCallerContext } from "@/hooks/useCallerContext"
import { verifyAuthRequest } from "@/lib/oauth2-request-lib"

const CODE_TTL_MS = 60 * 1000 // authorization codes are meant to be redeemed almost immediately

export const approveOAuth2Consent = async (requestToken: string) => {
    const pending = verifyAuthRequest(requestToken)
    if (!pending) {
        return { status: 400 as const, message: "This authorization request has expired — start over from your MCP client." }
    }

    const ctx = await getCallerContext(pending.workspaceId)
    if (ctx.error) return ctx.error

    const code = randomBytes(32).toString("hex")

    await client.authorizationCode.create({
        data: {
            code,
            clientId: pending.clientId,
            workspaceId: pending.workspaceId,
            toolId: pending.toolId,
            redirectUri: pending.redirectUri,
            codeChallenge: pending.codeChallenge,
            codeChallengeMethod: pending.codeChallengeMethod,
            scope: pending.scope ?? undefined,
            expiresAt: new Date(Date.now() + CODE_TTL_MS),
        },
    })

    const redirectUrl = new URL(pending.redirectUri)
    redirectUrl.searchParams.set("code", code)
    if (pending.clientState) redirectUrl.searchParams.set("state", pending.clientState)

    return { status: 200 as const, redirectUrl: redirectUrl.toString() }
}

export const denyOAuth2Consent = async (requestToken: string) => {
    const pending = verifyAuthRequest(requestToken)
    if (!pending) {
        return { status: 400 as const, message: "This authorization request has expired." }
    }

    const redirectUrl = new URL(pending.redirectUri)
    redirectUrl.searchParams.set("error", "access_denied")
    if (pending.clientState) redirectUrl.searchParams.set("state", pending.clientState)

    return { status: 200 as const, redirectUrl: redirectUrl.toString() }
}

// Used by the consent page itself to render "ClientName wants access to
// ToolName in WorkspaceName" before the user decides.
export const getConsentDisplayInfo = async (requestToken: string) => {
    const pending = verifyAuthRequest(requestToken)
    if (!pending) return { status: 400 as const, message: "Request expired" }

    const [oauthClient, tool] = await Promise.all([
        client.oAuthClient.findUnique({ where: { clientId: pending.clientId } }),
        client.tool.findUnique({ where: { id: pending.toolId }, select: { name: true, workspace: { select: { name: true } } } }),
    ])

    if (!oauthClient || !tool) return { status: 404 as const, message: "Client or tool not found" }

    return {
        status: 200 as const,
        data: {
            clientName: oauthClient.clientName,
            toolName: tool.name,
            workspaceName: tool.workspace.name,
            scope: pending.scope,
        },
    }
}