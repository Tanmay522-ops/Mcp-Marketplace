"use server"

import { client } from "@/lib/prisma"
import { getCallerContext } from "@/hooks/useCallerContext"

export const getToolDetails = async (workspaceId: string, toolId: string) => {
    try {
        const ctx = await getCallerContext(workspaceId)
        if (ctx.error) return ctx.error

        const tool = await client.tool.findUnique({
            where: { id: toolId },
            include: {
                versions: {
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    include: {
                        capabilities: {
                            orderBy: { createdAt: "asc" },
                        },
                        // Does THIS workspace have an install for this version? —
                        // this is what lets a workspace that installed (rather
                        // than deployed) the tool view its own connect page.
                        installs: {
                            where: { workspaceId },
                            select: { id: true, status: true },
                        },
                    },
                },
                deployments: {
                    orderBy: { createdAt: "desc" },
                    take: 1,
                },
                analytics: true,
            },
        })

        if (!tool) {
            return { status: 404 as const, message: "Tool not found" }
        }

        const isOwner = tool.workspaceId === workspaceId
        const version = tool.versions[0]
        const installedHere = (version?.installs.length ?? 0) > 0

        // Access allowed if you own it, OR you've installed it, OR it's
        // public (browsable, even before installing — e.g. viewing a
        // Featured tool's details from Browse before clicking Add).
        if (!isOwner && !installedHere && tool.visibility !== "PUBLIC") {
            return { status: 404 as const, message: "Tool not found in this workspace" }
        }

        const hasPassedTest = version
            ? (await client.toolExecution.count({
                where: {
                    type: "SMOKE_TEST",
                    status: "PASSED",
                    toolCapability: { toolVersionId: version.id },
                },
            })) > 0
            : false

        return {
            status: 200 as const,
            data: { tool, callerRole: ctx.callerRole, hasPassedTest, isOwner },
        }
    } catch (error) {
        console.error("getToolDetails error:", error)
        return { status: 500 as const, message: "Internal error fetching tool details" }
    }
}

export const publishTool = async (workspaceId: string, toolId: string) => {
    try {
        const ctx = await getCallerContext(workspaceId)
        if (ctx.error) return ctx.error

        if (ctx.callerRole !== "OWNER" && ctx.callerRole !== "ADMIN") {
            return { status: 403 as const, message: "You don't have permission to publish this tool" }
        }

        const tool = await client.tool.findUnique({
            where: { id: toolId },
            include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
        })
        if (!tool || tool.workspaceId !== workspaceId) {
            return { status: 404 as const, message: "Tool not found in this workspace" }
        }

        const version = tool.versions[0]
        if (!version) {
            return { status: 409 as const, message: "This tool doesn't have a version to publish" }
        }

        const hasPassedTest = await client.toolExecution.count({
            where: {
                type: "SMOKE_TEST",
                status: "PASSED",
                toolCapability: { toolVersionId: version.id },
            },
        })
        if (hasPassedTest === 0) {
            return { status: 409 as const, message: "Run a passing smoke test on at least one tool before publishing" }
        }

        const updated = await client.tool.update({
            where: { id: toolId },
            data: { visibility: "PUBLIC" },
        })

        return { status: 200 as const, data: updated }
    } catch (error) {
        console.error("publishTool error:", error)
        return { status: 500 as const, message: "Internal error publishing tool" }
    }
}

export const unpublishTool = async (workspaceId: string, toolId: string) => {
    try {
        const ctx = await getCallerContext(workspaceId)
       if (ctx.error) return ctx.error

        if (ctx.callerRole !== "OWNER" && ctx.callerRole !== "ADMIN") {
            return { status: 403 as const, message: "You don't have permission to unpublish this tool" }
        }

        const tool = await client.tool.findUnique({ where: { id: toolId } })
        if (!tool || tool.workspaceId !== workspaceId) {
            return { status: 404 as const, message: "Tool not found in this workspace" }
        }

        const updated = await client.tool.update({
            where: { id: toolId },
            data: { visibility: "PRIVATE" },
        })

        return { status: 200 as const, data: updated }
    } catch (error) {
        console.error("unpublishTool error:", error)
        return { status: 500 as const, message: "Internal error unpublishing tool" }
    }
}