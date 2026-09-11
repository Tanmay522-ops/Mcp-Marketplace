"use server"

import { currentUser } from "@clerk/nextjs/server"
import { client } from "@/lib/prisma"

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



export const updateMemberRole = async (
    workspaceId: string,
    memberId: string,
    role: "ADMIN" | "MEMBER"
) => {
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

        const isOwner = workspace.ownerId === user.id
        const callerMembership = await client.member.findUnique({
            where: { workspaceId_userId: { workspaceId, userId: user.id } },
        })
        const callerRole = isOwner ? "OWNER" : callerMembership?.role

        if (callerRole !== "OWNER" && callerRole !== "ADMIN") {
            return { status: 403, message: "You do not have permission to change roles" }
        }

        const targetMember = await client.member.findUnique({
            where: { id: memberId },
        })
        if (!targetMember || targetMember.workspaceId !== workspaceId) {
            return { status: 404, message: "Member not found" }
        }

        if (targetMember.role === "OWNER") {
            return { status: 400, message: "Cannot change the owner's role" }
        }

        if (targetMember.userId === user.id) {
            return { status: 400, message: "You cannot change your own role" }
        }

        const updated = await client.member.update({
            where: { id: memberId },
            data: { role },
        })

        return { status: 200, data: updated }
    } catch (error) {
        console.error("updateMemberRole error:", error)
        return { status: 500, message: "Internal error updating member role" }
    }
}

export const removeMember = async (workspaceId: string, memberId: string) => {
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

        const isOwner = workspace.ownerId === user.id
        const callerMembership = await client.member.findUnique({
            where: { workspaceId_userId: { workspaceId, userId: user.id } },
        })
        const callerRole = isOwner ? "OWNER" : callerMembership?.role

        if (callerRole !== "OWNER" && callerRole !== "ADMIN") {
            return { status: 403, message: "You do not have permission to remove members" }
        }

        const targetMember = await client.member.findUnique({
            where: { id: memberId },
        })
        if (!targetMember || targetMember.workspaceId !== workspaceId) {
            return { status: 404, message: "Member not found" }
        }

        if (targetMember.role === "OWNER") {
            return { status: 400, message: "Cannot remove the workspace owner" }
        }

        if (targetMember.userId === user.id) {
            return { status: 400, message: "You cannot remove yourself from the workspace" }
        }

        await client.member.delete({ where: { id: memberId } })

        return { status: 200, message: "Member removed" }
    } catch (error) {
        console.error("removeMember error:", error)
        return { status: 500, message: "Internal error removing member" }
    }
}

