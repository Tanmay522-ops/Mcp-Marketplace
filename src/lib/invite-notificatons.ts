import { client } from "@/lib/prisma"

type Person = { firstName: string | null; lastName: string | null; email: string }

export const displayPersonName = (p: Person) =>
    p.firstName ? `${p.firstName} ${p.lastName ?? ""}`.trim() : p.email

const buildCopy = (workspaceName: string, senderName: string, role: string) => ({
    title: `Invitation to ${workspaceName}`,
    message: `${senderName} invited you to join as ${role.toLowerCase()}`,
})

// Notification failures must never fail the invite itself, so every helper
// here catches and logs instead of throwing.

export const createInviteNotification = async (input: {
    userId: string
    inviteId: string
    workspaceName: string
    senderName: string
    role: string
}) => {
    try {
        await client.notification.create({
            data: {
                userId: input.userId,
                type: "INVITE",
                relatedId: input.inviteId,
                ...buildCopy(input.workspaceName, input.senderName, input.role),
            },
        })
    } catch (error) {
        console.error("createInviteNotification error:", error)
    }
}

// Used when an invite is revoked, replaced or cleaned up, so no notification
// is left pointing at an invite that no longer exists.
export const deleteInviteNotifications = async (inviteIds: string[]) => {
    if (inviteIds.length === 0) return
    try {
        await client.notification.deleteMany({
            where: { type: "INVITE", relatedId: { in: inviteIds } },
        })
    } catch (error) {
        console.error("deleteInviteNotifications error:", error)
    }
}

// Invites sent before the person had an account have no notification yet.
// Called from onAuthenticateUser right after a user row is created, so those
// invites show up on the notifications page too. Idempotent.
export const syncInviteNotifications = async (userId: string, email: string) => {
    try {
        const invites = await client.invite.findMany({
            where: {
                email,
                status: "PENDING",
                OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
            include: {
                workspace: { select: { name: true } },
                sender: { select: { firstName: true, lastName: true, email: true } },
            },
        })
        if (invites.length === 0) return

        const existing = await client.notification.findMany({
            where: { userId, type: "INVITE", relatedId: { in: invites.map((i) => i.id) } },
            select: { relatedId: true },
        })
        const have = new Set(existing.map((n) => n.relatedId))
        const fresh = invites.filter((i) => !have.has(i.id))
        if (fresh.length === 0) return

        await client.notification.createMany({
            data: fresh.map((i) => ({
                userId,
                type: "INVITE" as const,
                relatedId: i.id,
                ...buildCopy(i.workspace.name, displayPersonName(i.sender), i.role),
            })),
        })
        await client.invite.updateMany({
            where: { id: { in: fresh.map((i) => i.id) }, receiverId: null },
            data: { receiverId: userId },
        })
    } catch (error) {
        console.error("syncInviteNotifications error:", error)
    }
}