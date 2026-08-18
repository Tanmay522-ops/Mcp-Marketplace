"use server"

import { client } from "@/lib/prisma"
import { getCallerContext } from "@/hooks/useCallerContext"
import { encryptSecret } from "@/lib/tool-crypto"

export type ToolVariableRow = {
    id: string
    key: string
    description: string | null
    required: boolean
    hasValue: boolean
}

// Reads the variable definitions for a tool version, merged against
// whatever this workspace has already saved. Never returns the actual
// decrypted value to the client — only whether one exists — same
// principle as `hasApiKey` on ToolDetail's install object.
export const getToolVariables = async (workspaceId: string, toolVersionId: string) => {
    try {
        const ctx = await getCallerContext(workspaceId)
        if (ctx.error) return ctx.error

        const version = await client.toolVersion.findUnique({
            where: { id: toolVersionId },
            select: { id: true, toolId: true },
        })
        if (!version) return { status: 404 as const, message: "Tool version not found" }

        const tool = await client.tool.findUnique({
            where: { id: version.toolId },
            select: { workspaceId: true, visibility: true, usesApiKey: true },
        })
        if (!tool || (tool.workspaceId !== workspaceId && tool.visibility !== "PUBLIC")) {
            return { status: 404 as const, message: "Tool not found" }
        }
        if (!tool.usesApiKey) {
            return { status: 400 as const, message: "This tool has no configurable variables" }
        }

        const variables = await client.toolVariable.findMany({
            where: { toolVersionId },
            select: {
                id: true,
                key: true,
                description: true,
                required: true,
                values: { where: { workspaceId }, select: { id: true } },
            },
            orderBy: { createdAt: "asc" },
        })

        const rows: ToolVariableRow[] = variables.map((v) => ({
            id: v.id,
            key: v.key,
            description: v.description,
            required: v.required,
            hasValue: v.values.length > 0,
        }))

        return { status: 200 as const, data: rows }
    } catch (error) {
        console.error("getToolVariables error:", error)
        return { status: 500 as const, message: "Internal error loading variables" }
    }
}

export const saveToolVariable = async (workspaceId: string, toolVariableId: string, value: string) => {
    try {
        const ctx = await getCallerContext(workspaceId)
        if (ctx.error) return ctx.error

        const trimmedValue = value.trim()
        if (!trimmedValue) {
            return { status: 400 as const, message: "Value is required" }
        }

        const variable = await client.toolVariable.findUnique({
            where: { id: toolVariableId },
            select: {
                toolVersion: {
                    select: {
                        tool: { select: { workspaceId: true, visibility: true, usesApiKey: true } },
                    },
                },
            },
        })
        if (!variable) return { status: 404 as const, message: "Variable not found" }

        const tool = variable.toolVersion.tool
        if (tool.workspaceId !== workspaceId && tool.visibility !== "PUBLIC") {
            return { status: 404 as const, message: "Tool not found" }
        }
        if (!tool.usesApiKey) {
            return { status: 400 as const, message: "This tool has no configurable variables" }
        }

        await client.toolVariableValue.upsert({
            where: { toolVariableId_workspaceId: { toolVariableId, workspaceId } },
            create: { toolVariableId, workspaceId, valueEncrypted: encryptSecret(trimmedValue) },
            update: { valueEncrypted: encryptSecret(trimmedValue) },
        })

        return { status: 200 as const }
    } catch (error) {
        console.error("saveToolVariable error:", error)
        return { status: 500 as const, message: "Internal error saving variable" }
    }
}