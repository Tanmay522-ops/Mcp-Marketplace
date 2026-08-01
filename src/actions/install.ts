"use server"

import { Prisma } from "@prisma/client"
import { client } from "@/lib/prisma"
import { getCallerContext } from "@/hooks/useCallerContext"

const installWithToolInclude = {
    toolVersion: {
        select: {
            id: true,
            version: true,
            endpoint: true,
            capabilities: {
                select: { id: true, name: true, description: true },
            },
            tool: {
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    logoUrl: true,
                    requiresAuth: true,
                    deployments: {
                        orderBy: { createdAt: "desc" },
                        take: 1,
                        select: { status: true },
                    },
                },
            },
        },
    },
} satisfies Prisma.InstallRecordInclude

export type InstallWithTool = Prisma.InstallRecordGetPayload<{
    include: typeof installWithToolInclude
}>

export const getWorkspaceInstalls = async (workspaceId: string) => {
    try {
        const ctx = await getCallerContext(workspaceId)
        if (ctx.error) return ctx.error

        const installs = await client.installRecord.findMany({
            where: { workspaceId },
            include: installWithToolInclude,
            orderBy: { installedAt: "desc" },
        })

        return { status: 200 as const, data: { installs } }
    } catch (error) {
        console.error("getWorkspaceInstalls error:", error)
        return { status: 500 as const, message: "Internal error fetching installs" }
    }
}

const buildMarketplaceToolInclude = (workspaceId: string) =>
    ({
        versions: {
            where: { status: "PUBLISHED" as const },
            orderBy: { createdAt: "desc" as const },
            take: 1,
            select: {
                id: true,
                version: true,
                installs: {
                    where: { workspaceId },
                    select: { id: true, status: true },
                },
            },
        },
        analytics: { select: { totalInstalls: true } },
    }) satisfies Prisma.ToolInclude

export type MarketplaceTool = Prisma.ToolGetPayload<{
    include: ReturnType<typeof buildMarketplaceToolInclude>
}>

export const searchMarketplaceTools = async (workspaceId: string, query?: string) => {
    try {
        const ctx = await getCallerContext(workspaceId)
        if (ctx.error) return ctx.error

        const tools = await client.tool.findMany({
            where: {
                visibility: "PUBLIC",
                versions: { some: { status: "PUBLISHED" } },
                ...(query ? { name: { contains: query, mode: "insensitive" as const } } : {}),
            },
            include: buildMarketplaceToolInclude(workspaceId),
            orderBy: { analytics: { totalInstalls: "desc" } },
        })

        return { status: 200 as const, data: { tools } }
    } catch (error) {
        console.error("searchMarketplaceTools error:", error)
        return { status: 500 as const, message: "Internal error searching tools" }
    }
}

type InstallToolInput = {
    workspaceId: string
    toolVersionId: string
    method?: "MANUAL" | "GITHUB"
}

export const installTool = async ({ workspaceId, toolVersionId, method = "MANUAL" }: InstallToolInput) => {
    try {
        const ctx = await getCallerContext(workspaceId)
        if (ctx.error) return ctx.error

        const toolVersion = await client.toolVersion.findUnique({
            where: { id: toolVersionId },
            select: {
                toolId: true,
                status: true,
                tool: { select: { visibility: true, requiresAuth: true } },
            },
        })
        if (!toolVersion) {
            return { status: 404 as const, message: "Tool version not found" }
        }
        if (toolVersion.status !== "PUBLISHED") {
            return { status: 409 as const, message: "This tool version isn't published yet" }
        }
        if (toolVersion.tool.visibility !== "PUBLIC") {
            return { status: 403 as const, message: "This tool isn't publicly installable" }
        }

        const existing = await client.installRecord.findUnique({
            where: { workspaceId_toolVersionId: { workspaceId, toolVersionId } },
        })
        if (existing) {
            return { status: 409 as const, message: "Already installed in this workspace" }
        }

        // FIX: was "PENDING" here — that's reserved for "authorize attempted
        // but cancelled/failed." A tool that's never even seen the
        // authorize screen yet is NOT_CONNECTED. The other branches
        // (non-auth-required installs) are unrelated to this and untouched.
        const initialStatus = toolVersion.tool.requiresAuth
            ? "NOT_CONNECTED"
            : method === "MANUAL"
                ? "ACTIVE"
                : "PENDING"

        const install = await client.installRecord.create({
            data: {
                workspaceId,
                toolVersionId,
                installedById: ctx.userId,
                method,
                status: initialStatus,
            },
        })

        await client.toolAnalytics
            .update({
                where: { toolId: toolVersion.toolId },
                data: { totalInstalls: { increment: 1 } },
            })
            .catch((err: unknown) => console.error("installTool: analytics increment failed:", err))

        return {
            status: 201 as const,
            data: install,
            requiresAuth: toolVersion.tool.requiresAuth,
        }
    } catch (error) {
        console.error("installTool error:", error)
        return { status: 500 as const, message: "Internal error installing tool" }
    }
}

export const uninstallTool = async (workspaceId: string, installId: string) => {
    try {
        const ctx = await getCallerContext(workspaceId)
        if (ctx.error) return ctx.error

        const install = await client.installRecord.findUnique({ where: { id: installId } })
        if (!install || install.workspaceId !== workspaceId) {
            return { status: 404 as const, message: "Install not found" }
        }

        await client.installRecord.delete({ where: { id: installId } })
        return { status: 200 as const }
    } catch (error) {
        console.error("uninstallTool error:", error)
        return { status: 500 as const, message: "Internal error uninstalling tool" }
    }
}