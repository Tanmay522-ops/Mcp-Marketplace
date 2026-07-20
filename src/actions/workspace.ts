"use server"

import { currentUser } from "@clerk/nextjs/server"
import { client } from "@/lib/prisma"
import { generateWorkspaceSlug } from "@/hooks/generate-workspace-slug"



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





export const getWorkspaceMembers = async (workspaceId: string) => {
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

        const workspace = await client.workspace.findUnique({
            where: { id: workspaceId },
            select: { ownerId: true },
        })
        if (!workspace) {
            return { status: 404, message: "Workspace not found" }
        }

        const members = await client.member.findMany({
            where: { workspaceId },
            include: {
                user: {
                    select: { id: true, firstName: true, lastName: true, email: true, imageUrl: true },
                },
            },
            orderBy: { joinedAt: "asc" },
        })

        const isOwner = workspace.ownerId === user.id
        const callerMembership = members.find((m) => m.userId === user.id)

        if (!isOwner && !callerMembership) {
            return { status: 403, message: "You do not have access to this workspace" }
        }

        return {
            status: 200,
            data: {
                members,
                // The page needs to know the caller's own role and id to decide
                // which action buttons to show on which rows (e.g. hide
                // "Remove" on your own row, hide role controls entirely for a
                // plain MEMBER viewing the page).
                callerRole: isOwner ? "OWNER" : callerMembership!.role,
                callerId: user.id,
            },
        }
    } catch (error) {
        console.error("getWorkspaceMembers error:", error)
        return { status: 500, message: "Internal error fetching members" }
    }
}




export const createWorkspace = async (name: string) => {
    try {
        const authUser = await currentUser()
        if (!authUser) {
            return { status: 403 as const, message: "Not authenticated" }
        }

        const trimmedName = name.trim()
        if (!trimmedName) {
            return { status: 400 as const, message: "Workspace name is required" }
        }

        const user = await client.user.findUnique({
            where: { clerkId: authUser.id },
            select: { id: true },
        })
        if (!user) {
            return { status: 403 as const, message: "User not found" }
        }

        const slug = generateWorkspaceSlug(trimmedName, user.id)

        const workspace = await client.workspace.create({
            data: {
                name: trimmedName,
                slug,
                ownerId: user.id,
                members: {
                    create: {
                        userId: user.id,
                        role: "OWNER",
                    },
                },
            },
        })

        return { status: 201 as const, data: workspace }
    } catch (error) {
        console.error("createWorkspace error:", error)
        return { status: 500 as const, message: "Internal error creating workspace" }
    }
}



