"use server"

import { currentUser } from "@clerk/nextjs/server"
import { client } from "@/lib/prisma"

export const verifyAccessToWorkspace = async (workspaceId: string) => {
    try {
        const authUser = await currentUser()

        if (!authUser) {
            return { status: 403, message: "Not authenticated" }
        }

        const user = await client.user.findUnique({
            where: { clerkId: authUser.id },
            select: { id: true },
        })

        if (!user) {
            return { status: 403, message: "User not found" }
        }

        // Fetch the workspace, but only pull back this user's Member row (if
        // any) instead of the full member list — cheaper, and this filter
        // rides the existing @@unique([workspaceId, userId]) index on Member.
        const workspace = await client.workspace.findUnique({
            where: { id: workspaceId },
            include: {
                members: {
                    where: { userId: user.id },
                },
            },
        })

        if (!workspace) {
            return { status: 404, message: "Workspace not found" }
        }

        const isOwner = workspace.ownerId === user.id
        const membership = workspace.members[0]

        if (!isOwner && !membership) {
            return { status: 403, message: "You do not have access to this workspace" }
        }

        return {
            status: 200,
            data: {
                workspace,
                role: isOwner ? "OWNER" : membership!.role,
            },
        }
    } catch (error) {
        console.error("verifyAccessToWorkspace error:", error)
        return { status: 500, message: "Internal error verifying workspace access" }
    }
}