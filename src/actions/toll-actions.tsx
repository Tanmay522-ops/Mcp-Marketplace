"use server"

import { client } from "@/lib/prisma"
import { getCallerContext } from "@/hooks/useCallerContext"
import type { DeploymentStatus, InstallStatus } from "@prisma/client"

export type ToolDetail = {
    id: string
    name: string
    slug: string
    description: string
    logoUrl: string | null
    websiteUrl: string | null
    documentationUrl: string | null
    requiresAuth: boolean
    // Present only for custom (Railway) deploys — a marketplace tool
    // connected purely via OAuth has no Deployment row at all.
    deployment: {
        id: string
        status: DeploymentStatus
        errorMessage: string | null
        railwayDomain: string | null
    } | null
    version: {
        id: string
        version: string
        endpoint: string
    } | null
    // This workspace's own InstallRecord for the tool, if any — a tool
    // can exist in the marketplace/be deployed without this workspace
    // having installed/connected it yet.
    install: {
        id: string
        status: InstallStatus
    } | null
}

export const getToolDetail = async (workspaceId: string, toolId: string) => {
    try {
        const ctx = await getCallerContext(workspaceId)
        if (ctx.error) return ctx.error

        const tool = await client.tool.findFirst({
            where: { id: toolId, workspaceId },
            select: {
                id: true,
                name: true,
                slug: true,
                description: true,
                logoUrl: true,
                websiteUrl: true,
                documentationUrl: true,
                requiresAuth: true,
                deployments: {
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: { id: true, status: true, errorMessage: true, railwayDomain: true },
                },
                versions: {
                    where: { status: "PUBLISHED" },
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: {
                        id: true,
                        version: true,
                        endpoint: true,
                        installs: {
                            where: { workspaceId },
                            select: { id: true, status: true },
                        },
                    },
                },
            },
        })

        if (!tool) {
            return { status: 404 as const, message: "Tool not found in this workspace" }
        }

        const version = tool.versions[0] ?? null
        const install = version?.installs[0] ?? null
        const deployment = tool.deployments[0] ?? null

        const data: ToolDetail = {
            id: tool.id,
            name: tool.name,
            slug: tool.slug,
            description: tool.description,
            logoUrl: tool.logoUrl,
            websiteUrl: tool.websiteUrl,
            documentationUrl: tool.documentationUrl,
            requiresAuth: tool.requiresAuth,
            deployment,
            version: version ? { id: version.id, version: version.version, endpoint: version.endpoint } : null,
            install,
        }

        return { status: 200 as const, data }
    } catch (error) {
        console.error("getToolDetail error:", error)
        return { status: 500 as const, message: "Internal error fetching tool" }
    }
}