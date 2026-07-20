"use server"

import { currentUser } from "@clerk/nextjs/server"
import { client } from "@/lib/prisma"
import InviteEmail from "@/emails/invite-email"
import { resend } from "@/lib/resend-client"
import { getCallerContext } from "@/hooks/useCallerContext"

type SendInviteInput = {
    workspaceId: string
    email: string
    role: "ADMIN" | "MEMBER"
}

export const sendInvite = async ({ workspaceId, email, role }: SendInviteInput) => {
    try {
        const ctx = await getCallerContext(workspaceId)
        if (ctx.error) return ctx.error

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
            include: {
                workspace: { select: { name: true } },
                sender: { select: { firstName: true, lastName: true, email: true } },
            },
        })

        const acceptUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${invite.id}`
        const senderName = invite.sender.firstName
            ? `${invite.sender.firstName} ${invite.sender.lastName ?? ""}`.trim()
            : invite.sender.email

        let emailSent = true
        try {
            const { error: sendError } = await resend.emails.send({
                from: "Acme <onboarding@resend.dev>", 
                to: email,
                subject: `You've been invited to ${invite.workspace.name}`,
                react: (
                    <InviteEmail
            workspaceName= { invite.workspace.name }
            senderName={ senderName }
            role={ role }
            acceptUrl={ acceptUrl }
                />
        ),
        })
        if (sendError) {
            console.error("sendInvite: Resend returned an error:", sendError)
            emailSent = false
        }
    } catch (emailError) {
        console.error("sendInvite: failed to send invite email:", emailError)
        emailSent = false
    }

    return { status: 201 as const, data: invite, emailSent }
} catch (error) {
    console.error("sendInvite error:", error)
    return { status: 500 as const, message: "Internal error sending invite" }
}
}

export const getWorkspaceInvites = async (workspaceId: string) => {
    try {
        const ctx = await getCallerContext(workspaceId)
        if (ctx.error) return ctx.error

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
        if (ctx.error) return ctx.error

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





export const getInviteDetails = async (inviteId: string) => {
    try {
        const authUser = await currentUser()
        if (!authUser) {
            return { status: 403 as const, message: "Not authenticated" }
        }

        const invite = await client.invite.findUnique({
            where: { id: inviteId },
            include: {
                workspace: { select: { id: true, name: true, image: true } },
                sender: { select: { firstName: true, lastName: true, email: true } },
            },
        })

        if (!invite) {
            return { status: 404 as const, message: "Invite not found" }
        }

        // The invite has an email it was sent to — the logged-in visitor
        // must match that email, otherwise anyone with the link could
        // accept an invite meant for someone else.
        if (invite.email.toLowerCase() !== authUser.emailAddresses[0]?.emailAddress?.toLowerCase()) {
            return { status: 403 as const, message: "This invite was sent to a different email address" }
        }

        if (invite.status !== "PENDING") {
            return { status: 409 as const, message: `This invite has already been ${invite.status.toLowerCase()}` }
        }

        return { status: 200 as const, data: invite }
    } catch (error) {
        console.error("getInviteDetails error:", error)
        return { status: 500 as const, message: "Internal error fetching invite" }
    }
}

export const acceptInvite = async (inviteId: string) => {
    try {
        const authUser = await currentUser()
        if (!authUser) {
            return { status: 403 as const, message: "Not authenticated" }
        }

        const user = await client.user.findUnique({
            where: { clerkId: authUser.id },
            select: { id: true, email: true },
        })
        if (!user) {
            return { status: 403 as const, message: "User not found" }
        }

        const invite = await client.invite.findUnique({ where: { id: inviteId } })
        if (!invite) {
            return { status: 404 as const, message: "Invite not found" }
        }

        if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
            return { status: 403 as const, message: "This invite was sent to a different email address" }
        }

        if (invite.status !== "PENDING") {
            return { status: 409 as const, message: `This invite has already been ${invite.status.toLowerCase()}` }
        }

        // Already a member somehow (e.g. double-click, or added another way
        // since the invite was sent) — don't create a duplicate Member row,
        // just mark the invite accepted and move on.
        const existingMembership = await client.member.findUnique({
            where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: user.id } },
        })

        if (existingMembership) {
            await client.invite.update({
                where: { id: inviteId },
                data: { status: "ACCEPTED", receiverId: user.id },
            })
            return { status: 200 as const, data: { workspaceId: invite.workspaceId } }
        }

        // Create the Member row and mark the invite accepted together —
        // if one fails, neither should happen.
        await client.$transaction([
            client.member.create({
                data: {
                    workspaceId: invite.workspaceId,
                    userId: user.id,
                    role: invite.role,
                },
            }),
            client.invite.update({
                where: { id: inviteId },
                data: { status: "ACCEPTED", receiverId: user.id },
            }),
        ])

        return { status: 200 as const, data: { workspaceId: invite.workspaceId } }
    } catch (error) {
        console.error("acceptInvite error:", error)
        return { status: 500 as const, message: "Internal error accepting invite" }
    }
}

export const declineInvite = async (inviteId: string) => {
    try {
        const authUser = await currentUser()
        if (!authUser) {
            return { status: 403 as const, message: "Not authenticated" }
        }

        const invite = await client.invite.findUnique({ where: { id: inviteId } })
        if (!invite) {
            return { status: 404 as const, message: "Invite not found" }
        }

        if (invite.email.toLowerCase() !== authUser.emailAddresses[0]?.emailAddress?.toLowerCase()) {
            return { status: 403 as const, message: "This invite was sent to a different email address" }
        }

        if (invite.status !== "PENDING") {
            return { status: 409 as const, message: `This invite has already been ${invite.status.toLowerCase()}` }
        }

        await client.invite.update({
            where: { id: inviteId },
            data: { status: "DECLINED" },
        })

        return { status: 200 as const }
    } catch (error) {
        console.error("declineInvite error:", error)
        return { status: 500 as const, message: "Internal error declining invite" }
    }
}