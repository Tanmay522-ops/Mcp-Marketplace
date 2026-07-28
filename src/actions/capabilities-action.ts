"use server"

import { Prisma } from "@prisma/client"
import { client } from "@/lib/prisma"
import { getCallerContext } from "@/hooks/useCallerContext"

const capabilityWithExecutionsInclude = {
    executions: {
        where: { type: "SMOKE_TEST" as const },
        orderBy: { startedAt: "desc" as const },
        take: 1,
    },
} satisfies Prisma.ToolCapabilityInclude

export type CapabilityWithExecutions = Prisma.ToolCapabilityGetPayload<{
    include: typeof capabilityWithExecutionsInclude
}>

export const getToolCapabilities = async (workspaceId: string, toolVersionId: string) => {
    try {
        const ctx = await getCallerContext(workspaceId)
        if (ctx.error) return ctx.error

        const capabilities = await client.toolCapability.findMany({
            where: { toolVersionId },
            include: capabilityWithExecutionsInclude,
            orderBy: { createdAt: "asc" },
        })

        return { status: 200 as const, data: { capabilities } }
    } catch (error) {
        console.error("getToolCapabilities error:", error)
        return { status: 500 as const, message: "Internal error fetching capabilities" }
    }
}

type UpsertCapabilityInput = {
    workspaceId: string
    toolVersionId: string
    capabilityId?: string // present = update, absent = create
    name: string
    description: string
    inputSchema: string
    outputSchema: string
    exampleInput: string
    exampleOutput: string
}

export const upsertToolCapability = async ({
    workspaceId,
    toolVersionId,
    capabilityId,
    name,
    description,
    inputSchema,
    outputSchema,
    exampleInput,
    exampleOutput,
}: UpsertCapabilityInput) => {
    try {
        const ctx = await getCallerContext(workspaceId)
        if (ctx.error) return ctx.error

        if (ctx.callerRole !== "OWNER" && ctx.callerRole !== "ADMIN") {
            return { status: 403 as const, message: "You don't have permission to edit this tool" }
        }

        const trimmedName = name.trim()
        if (!trimmedName) {
            return { status: 400 as const, message: "Tool name is required" }
        }

        const parse = (label: string, raw: string) => {
            try {
                return { ok: true as const, value: JSON.parse(raw) }
            } catch {
                return { ok: false as const, error: `${label} is not valid JSON` }
            }
        }

        const parsedInput = parse("Input schema", inputSchema)
        const parsedOutput = parse("Output schema", outputSchema)
        const parsedExampleInput = parse("Example input", exampleInput)
        const parsedExampleOutput = parse("Example output", exampleOutput)

        const errors = [parsedInput, parsedOutput, parsedExampleInput, parsedExampleOutput]
            .filter((p) => !p.ok)
            .map((p) => (p as { ok: false; error: string }).error)

        if (errors.length > 0) {
            return { status: 400 as const, message: errors.join(" · ") }
        }

        const data = {
            name: trimmedName,
            description: description.trim() || null,
            inputSchema: parsedInput.ok ? parsedInput.value : {},
            outputSchema: parsedOutput.ok ? parsedOutput.value : {},
            exampleInput: parsedExampleInput.ok ? parsedExampleInput.value : {},
            exampleOutput: parsedExampleOutput.ok ? parsedExampleOutput.value : {},
        }

        if (capabilityId) {
            const existing = await client.toolCapability.findUnique({ where: { id: capabilityId } })
            if (!existing || existing.toolVersionId !== toolVersionId) {
                return { status: 404 as const, message: "Tool capability not found" }
            }
            const updated = await client.toolCapability.update({ where: { id: capabilityId }, data })
            return { status: 200 as const, data: updated }
        }

        // Creating a new one — name must be unique within this version
        // (matches @@unique([toolVersionId, name]) on the schema).
        const existingName = await client.toolCapability.findUnique({
            where: { toolVersionId_name: { toolVersionId, name: trimmedName } },
        })
        if (existingName) {
            return { status: 409 as const, message: `A tool named "${trimmedName}" already exists on this version` }
        }

        const created = await client.toolCapability.create({ data: { ...data, toolVersionId } })
        return { status: 201 as const, data: created }
    } catch (error) {
        console.error("upsertToolCapability error:", error)
        return { status: 500 as const, message: "Internal error saving tool capability" }
    }
}

export const deleteToolCapability = async (workspaceId: string, capabilityId: string) => {
    try {
        const ctx = await getCallerContext(workspaceId)
        if (ctx.error) return ctx.error

        if (ctx.callerRole !== "OWNER" && ctx.callerRole !== "ADMIN") {
            return { status: 403 as const, message: "You don't have permission to delete this" }
        }

        await client.toolCapability.delete({ where: { id: capabilityId } })
        return { status: 200 as const }
    } catch (error) {
        console.error("deleteToolCapability error:", error)
        return { status: 500 as const, message: "Internal error deleting tool capability" }
    }
}