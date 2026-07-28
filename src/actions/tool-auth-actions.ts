"use server"

import { client } from "@/lib/prisma"
import { getCallerContext } from "@/hooks/useCallerContext"
import { encryptSecret } from "@/lib/tool-crypto"

type ConfigureToolAuthInput = {
    workspaceId: string
    toolId: string
    requiresAuth: boolean
    oauthAuthorizeUrl?: string
    oauthTokenUrl?: string
    oauthClientId?: string
    oauthClientSecret?: string // raw — encrypted before storage, never stored as-is
    oauthScopes?: string
}

export const configureCustomToolAuth = async ({
    workspaceId,
    toolId,
    requiresAuth,
    oauthAuthorizeUrl,
    oauthTokenUrl,
    oauthClientId,
    oauthClientSecret,
    oauthScopes,
}: ConfigureToolAuthInput) => {
    try {
        const ctx = await getCallerContext(workspaceId)
        if (ctx.error) return ctx.error
        if (ctx.callerRole !== "OWNER" && ctx.callerRole !== "ADMIN") {
            return { status: 403 as const, message: "You don't have permission to configure this tool" }
        }

        const tool = await client.tool.findFirst({ where: { id: toolId, workspaceId } })
        if (!tool) return { status: 404 as const, message: "Tool not found in this workspace" }

        if (!requiresAuth) {
            await client.tool.update({
                where: { id: toolId },
                data: {
                    requiresAuth: false,
                    oauthAuthorizeUrl: null,
                    oauthTokenUrl: null,
                    oauthClientId: null,
                    oauthClientSecretEncrypted: null,
                    oauthScopes: null,
                },
            })
            return { status: 200 as const }
        }

        if (!oauthAuthorizeUrl?.trim() || !oauthTokenUrl?.trim() || !oauthClientId?.trim()) {
            return {
                status: 400 as const,
                message: "Authorize URL, token URL, and client ID are required when auth is enabled",
            }
        }

        await client.tool.update({
            where: { id: toolId },
            data: {
                requiresAuth: true,
                oauthAuthorizeUrl: oauthAuthorizeUrl.trim(),
                oauthTokenUrl: oauthTokenUrl.trim(),
                oauthClientId: oauthClientId.trim(),
                // only overwrite the stored secret if a new one was actually
                // provided — lets the deployer update other fields without
                // being forced to re-paste the secret every time
                ...(oauthClientSecret?.trim() ? { oauthClientSecretEncrypted: encryptSecret(oauthClientSecret.trim()) } : {}),
                oauthScopes: oauthScopes?.trim() || null,
            },
        })

        return { status: 200 as const }
    } catch (error) {
        console.error("configureCustomToolAuth error:", error)
        return { status: 500 as const, message: "Internal error saving auth configuration" }
    }
}