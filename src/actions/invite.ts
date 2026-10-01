"use server"

import React from "react"
import { currentUser } from "@clerk/nextjs/server"
import { client } from "@/lib/prisma"
import InviteEmail from "@/emails/invite-email"
import { resend } from "@/lib/resend-client"
import { getCallerContext } from "@/hooks/useCallerContext"
import {
    createInviteNotification,
    deleteInviteNotifications,
    displayPersonName,
} from "@/lib/invite-notificatons"

type SendInviteInput = {
    workspaceId: string
    email: string
    role: "ADMIN" | "MEMBER"
}

type ClerkUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>

const ALLOWED_ROLES = ["ADMIN", "MEMBER"] as const
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const INVITE_TTL_DAYS = 7

// Set INVITE_FROM_EMAIL (e.g. "Acme <invites@yourdomain.com>") once your
// domain is verified in Resend. Until then the sandbox sender only delivers
// to your own Resend account's email.
const INVITE_FROM = process.env.INVITE_FROM_EMAIL ?? "Acme <onboarding@resend.dev>"

const normalizeEmail = (email: string) => email.trim().toLowerCase()

const isUniqueViolation = (error: unknown) =>
    typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002"

// Null expiresAt = legacy invite, never expires.
const isExpired = (invite: { expiresAt: Date | null }) =>
    invite.expiresAt !== null && invite.expiresAt.getTime() < Date.now()

// Only *verified* addresses count — otherwise someone could add an unverified
// address to their own account and claim an invite meant for another person.
const getVerifiedEmails = (user: ClerkUser) =>
    user.emailAddresses
        .filter((e) => e.verification?.status === "verified")
        .map((e) => normalizeEmail(e.emailAddress))

const emailMatchesInvite = (user: ClerkUser, inviteEmail: string) =>
    getVerifiedEmails(user).includes(normalizeEmail(inviteEmail))

export const sendInvite = async ({ workspaceId, email: rawEmail, role }: SendInviteInput) => {
    try {
        // Server actions are public endpoints — never trust the client's types.
        if (!ALLOWED_ROLES.includes(role)) {
            return { status: 400 as const, message: "Invalid role" }
        }
        const email = normalizeEmail(rawEmail ?? "")
        if (!EMAIL_RE.test(email)) {
            return { status: 400 as const, message: "Enter a valid email address" }
        }

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
            if (!isExpired(existingPendingInvite)) {
                return { status: 409 as const, message: "An invite is already pending for this email" }
            }
            // Expired but still PENDING: clear it (and its notification) so a
            // fresh invite can be sent.
            await deleteInviteNotifications([existingPendingInvite.id])
            await client.invite.delete({ where: { id: existingPendingInvite.id } })
        }

        // The unique key is (workspaceId, email, status), so only one DECLINED
        // and one ACCEPTED row can exist per email. Clear old non-pending
        // invites first, otherwise a second decline later hits a unique
        // constraint error (500). Remove this if `status` leaves the key.
        const stale = await client.invite.findMany({
            where: { workspaceId, email, status: { not: "PENDING" } },
            select: { id: true },
        })
        if (stale.length > 0) {
            const staleIds = stale.map((i) => i.id)
            await deleteInviteNotifications(staleIds)
            await client.invite.deleteMany({ where: { id: { in: staleIds } } })
        }

        const invite = await client.invite.create({
            data: {
                workspaceId,
                senderId: ctx.userId,
                receiverId: existingUser?.id,
                email,
                role,
                status: "PENDING",
                expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
            },
            include: {
                workspace: { select: { name: true } },
                sender: { select: { firstName: true, lastName: true, email: true } },
            },
        })

        const senderName = displayPersonName(invite.sender)

        // Existing users get an in-app notification they can accept/decline
        // from. People without an account yet get theirs on first sign-in
        // (see syncInviteNotifications in onAuthenticateUser).
        if (existingUser) {
            await createInviteNotification({
                userId: existingUser.id,
                inviteId: invite.id,
                workspaceName: invite.workspace.name,
                senderName,
                role,
            })
        }

        const hostUrl = process.env.NEXT_PUBLIC_HOST_URL?.replace(/\/+$/, "")
        if (!hostUrl) {
            console.warn("sendInvite: NEXT_PUBLIC_HOST_URL is not set — the invite email's link will be broken.")
        }
        const acceptUrl = `${hostUrl ?? ""}/invite/${invite.id}`

        let emailSent = true
        try {
            const { error: sendError } = await resend.emails.send({
                from: INVITE_FROM,
                to: email,
                subject: `You've been invited to ${invite.workspace.name}`,
                react: React.createElement(InviteEmail, {
                    workspaceName: invite.workspace.name,
                    senderName,
                    role,
                    acceptUrl,
                }),
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
        // Two simultaneous sends can both pass the pending check; the loser
        // hits the unique key.
        if (isUniqueViolation(error)) {
            return { status: 409 as const, message: "An invite is already pending for this email" }
        }
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

        // Remove the invitee's notification too, so it can't point at a
        // deleted invite.
        await deleteInviteNotifications([inviteId])
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

        // The invite was sent to a specific email — the logged-in visitor must
        // own that address (any verified email on their account), otherwise
        // anyone with the link could accept an invite meant for someone else.
        if (!emailMatchesInvite(authUser, invite.email)) {
            return { status: 403 as const, message: "This invite was sent to a different email address" }
        }

        if (invite.status !== "PENDING") {
            return { status: 409 as const, message: `This invite has already been ${invite.status.toLowerCase()}` }
        }

        if (isExpired(invite)) {
            return { status: 410 as const, message: "This invite has expired. Ask for a new one." }
        }

        return { status: 200 as const, data: invite }
    } catch (error) {
        console.error("getInviteDetails error:", error)
        return { status: 500 as const, message: "Internal error fetching invite" }
    }
}

// Invites shown on the notifications page: one entry per INVITE notification
// of the signed-in user, with the invite's current state worked out here so
// the UI only has to render it.
export const getMyInviteNotifications = async () => {
    try {
        const authUser = await currentUser()
        if (!authUser) {
            return { status: 403 as const, message: "Not authenticated" }
        }

        const user = await client.user.findUnique({
            where: { clerkId: authUser.id },
            select: { id: true },
        })
        if (!user) {
            return { status: 403 as const, message: "User not found" }
        }

        const notifications = await client.notification.findMany({
            where: { userId: user.id, type: "INVITE" },
            orderBy: { createdAt: "desc" },
        })

        const inviteIds = notifications
            .map((n) => n.relatedId)
            .filter((id): id is string => id !== null)

        const invites = inviteIds.length
            ? await client.invite.findMany({
                where: { id: { in: inviteIds } },
                include: {
                    workspace: { select: { id: true, name: true, image: true } },
                    sender: { select: { firstName: true, lastName: true, email: true } },
                },
            })
            : []
        const inviteById = new Map(invites.map((i) => [i.id, i]))

        const items = notifications.map((n) => {
            const invite = n.relatedId ? inviteById.get(n.relatedId) ?? null : null

            let state: "pending" | "accepted" | "declined" | "expired" | "unavailable"
            if (!invite) state = "unavailable" // revoked or deleted
            else if (invite.status === "ACCEPTED") state = "accepted"
            else if (invite.status === "DECLINED") state = "declined"
            else if (isExpired(invite)) state = "expired"
            else state = "pending"

            return {
                id: n.id,
                title: n.title,
                message: n.message,
                read: n.read,
                createdAt: n.createdAt,
                state,
                invite: invite
                    ? {
                        id: invite.id,
                        role: invite.role,
                        workspaceName: invite.workspace.name,
                        workspaceImage: invite.workspace.image,
                    }
                    : null,
            }
        })

        return { status: 200 as const, data: items }
    } catch (error) {
        console.error("getMyInviteNotifications error:", error)
        return { status: 500 as const, message: "Internal error fetching invitations" }
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
            select: { id: true },
        })
        if (!user) {
            return { status: 403 as const, message: "User not found" }
        }

        const invite = await client.invite.findUnique({ where: { id: inviteId } })
        if (!invite) {
            return { status: 404 as const, message: "Invite not found" }
        }

        if (!emailMatchesInvite(authUser, invite.email)) {
            return { status: 403 as const, message: "This invite was sent to a different email address" }
        }

        if (invite.status !== "PENDING") {
            return { status: 409 as const, message: `This invite has already been ${invite.status.toLowerCase()}` }
        }

        if (isExpired(invite)) {
            return { status: 410 as const, message: "This invite has expired. Ask for a new one." }
        }

        // upsert (not create) so a double-click or an existing membership
        // can't throw a unique-constraint error. `update: {}` keeps an
        // existing member's role untouched. The notification is marked read
        // in the same transaction so the two can't disagree.
        await client.$transaction([
            client.member.upsert({
                where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: user.id } },
                update: {},
                create: {
                    workspaceId: invite.workspaceId,
                    userId: user.id,
                    role: invite.role,
                },
            }),
            client.invite.update({
                where: { id: inviteId },
                data: { status: "ACCEPTED", receiverId: user.id },
            }),
            client.notification.updateMany({
                where: { userId: user.id, type: "INVITE", relatedId: inviteId },
                data: { read: true, readAt: new Date() },
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

        if (!emailMatchesInvite(authUser, invite.email)) {
            return { status: 403 as const, message: "This invite was sent to a different email address" }
        }

        if (invite.status !== "PENDING") {
            return { status: 409 as const, message: `This invite has already been ${invite.status.toLowerCase()}` }
        }

        if (isExpired(invite)) {
            return { status: 410 as const, message: "This invite has expired." }
        }

        // Only the invitee holds a notification for this invite (relatedId is
        // the invite id), so no user lookup is needed here.
        await client.$transaction([
            client.invite.update({
                where: { id: inviteId },
                data: { status: "DECLINED" },
            }),
            client.notification.updateMany({
                where: { type: "INVITE", relatedId: inviteId },
                data: { read: true, readAt: new Date() },
            }),
        ])

        return { status: 200 as const }
    } catch (error) {
        console.error("declineInvite error:", error)
        return { status: 500 as const, message: "Internal error declining invite" }
    }
}