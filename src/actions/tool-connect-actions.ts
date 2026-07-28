"use server"

import { client } from "@/lib/prisma"
import { getCallerContext } from "@/hooks/useCallerContext"

type InstallMarketplaceToolInput = {
    workspaceId: string
    toolVersionId: string
}

// Called when the user clicks "Add" on the browse page for a MARKETPLACE
// tool (Tool/ToolVersion already exist, curated). Custom-deployed tools
// don't go through this — their InstallRecord is auto-created by
// pollDeploymentStatus in actions/deploy.ts on first RUNNING instead.
export const installMarketplaceTool = async ({ workspaceId, toolVersionId }: InstallMarketplaceToolInput) => {
    try {
        const ctx = await getCallerContext(workspaceId)
        if (ctx.error) return ctx.error

        const toolVersion = await client.toolVersion.findUnique({
            where: { id: toolVersionId },
            select: { tool: { select: { id: true, slug: true, requiresAuth: true } } },
        })
        if (!toolVersion) return { status: 404 as const, message: "Tool version not found" }

        const initialStatus = toolVersion.tool.requiresAuth ? "NOT_CONNECTED" : "ACTIVE"

        await client.installRecord.upsert({
            where: { workspaceId_toolVersionId: { workspaceId, toolVersionId } },
            // Re-adding after a previous remove/cancel resets back to the
            // correct starting state rather than keeping stale OAuth data.
            update: {
                status: initialStatus,
                ...(toolVersion.tool.requiresAuth
                    ? { oauthAccessToken: null, oauthRefreshToken: null, oauthExpiresAt: null }
                    : {}),
            },
            create: {
                workspaceId,
                toolVersionId,
                installedById: ctx.userId,
                method: "MANUAL",
                status: initialStatus,
            },
        })

        return { status: 200 as const, data: { toolId: toolVersion.tool.id, toolSlug: toolVersion.tool.slug } }
    } catch (error) {
        console.error("installMarketplaceTool error:", error)
        return { status: 500 as const, message: "Internal error installing tool" }
    }
}