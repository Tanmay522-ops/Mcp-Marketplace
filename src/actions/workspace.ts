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


const generateWorkspaceSlug = (name: string, userId: string) => {
    const base = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
    const suffix = userId.slice(0, 6) + Math.random().toString(36).slice(2, 6)
    return `${base}-${suffix}`
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

        // Same pattern as the first-login flow in onAuthenticateUser — create
        // the Workspace and the owner's own Member row together, so the
        // owner shows up in the member list immediately, not just via
        // Workspace.ownerId.
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


type SendInviteInput = {
    workspaceId: string
    email: string
    role: "ADMIN" | "MEMBER"
}

// Shared by all three actions below — confirms the caller belongs to
// this workspace and returns their role, so each action can gate on it
// without repeating the same three queries three times.
const getCallerContext = async (workspaceId: string) => {
    const authUser = await currentUser()
    if (!authUser) return { error: { status: 403 as const, message: "Not authenticated" } }

    const user = await client.user.findUnique({
        where: { clerkId: authUser.id },
        select: { id: true },
    })
    if (!user) return { error: { status: 403 as const, message: "User not found" } }

    const workspace = await client.workspace.findUnique({
        where: { id: workspaceId },
        select: {
            ownerId: true,
            members: { where: { userId: user.id } },
        },
    })
    if (!workspace) return { error: { status: 404 as const, message: "Workspace not found" } }

    const isOwner = workspace.ownerId === user.id
    const callerMembership = workspace.members[0]

    if (!isOwner && !callerMembership) {
        return { error: { status: 403 as const, message: "You do not have access to this workspace" } }
    }

    const callerRole = isOwner ? "OWNER" : callerMembership!.role
    return { userId: user.id, callerRole }
}

export const sendInvite = async ({ workspaceId, email, role }: SendInviteInput) => {
    try {
        const ctx = await getCallerContext(workspaceId)
        if ("error" in ctx) return ctx.error

        // Only OWNER/ADMIN can invite — a plain MEMBER can't add teammates.
        if (ctx.callerRole !== "OWNER" && ctx.callerRole !== "ADMIN") {
            return { status: 403 as const, message: "You don't have permission to invite members" }
        }

        // Don't invite someone who's already a member of this workspace.
        const existingUser = await client.user.findUnique({
            where: { email },
            select: { id: true },
        })

        if (existingUser) {
            const alreadyMember = await client.member.findUnique({
                where: { workspaceId_userId: { workspaceId, userId: existingUser.id } },
            })
            if (alreadyMember) {
                return { status: 409 as const, message: "This person is already a member of this workspace" }
            }
        }

        // The schema's @@unique([workspaceId, email, status]) would reject a
        // duplicate PENDING invite at the DB level anyway — checking first
        // just gives a clean message instead of a raw constraint error.
        const existingPendingInvite = await client.invite.findUnique({
            where: { workspaceId_email_status: { workspaceId, email, status: "PENDING" } },
        })
        if (existingPendingInvite) {
            return { status: 409 as const, message: "An invite is already pending for this email" }
        }

        const invite = await client.invite.create({
            data: {
                workspaceId,
                senderId: ctx.userId,
                receiverId: existingUser?.id,
                email,
                role,
                status: "PENDING",
            },
        })

        // NOTE: this only creates the DB row. Actually emailing the invite
        // link to `email` needs a mail provider (Resend/SendGrid/etc.) wired
        // in separately — not part of this action.
        return { status: 201 as const, data: invite }
    } catch (error) {
        console.error("sendInvite error:", error)
        return { status: 500 as const, message: "Internal error sending invite" }
    }
}

export const getWorkspaceInvites = async (workspaceId: string) => {
    try {
        const ctx = await getCallerContext(workspaceId)
        if ("error" in ctx) return ctx.error

        if (ctx.callerRole !== "OWNER" && ctx.callerRole !== "ADMIN") {
            return { status: 403 as const, message: "You don't have permission to view invites" }
        }

        const invites = await client.invite.findMany({
            where: { workspaceId, status: "PENDING" },
            include: {
                sender: { select: { firstName: true, lastName: true, email: true } },
            },
            orderBy: { createdAt: "desc" },
        })

        return { status: 200 as const, data: { invites, callerRole: ctx.callerRole } }
    } catch (error) {
        console.error("getWorkspaceInvites error:", error)
        return { status: 500 as const, message: "Internal error fetching invites" }
    }
}

export const revokeInvite = async (workspaceId: string, inviteId: string) => {
    try {
        const ctx = await getCallerContext(workspaceId)
        if ("error" in ctx) return ctx.error

        if (ctx.callerRole !== "OWNER" && ctx.callerRole !== "ADMIN") {
            return { status: 403 as const, message: "You don't have permission to revoke invites" }
        }

        const invite = await client.invite.findUnique({ where: { id: inviteId } })
        if (!invite || invite.workspaceId !== workspaceId) {
            return { status: 404 as const, message: "Invite not found" }
        }
        if (invite.status !== "PENDING") {
            return { status: 409 as const, message: "Only pending invites can be revoked" }
        }

        await client.invite.delete({ where: { id: inviteId } })
        return { status: 200 as const }
    } catch (error) {
        console.error("revokeInvite error:", error)
        return { status: 500 as const, message: "Internal error revoking invite" }
    }
}