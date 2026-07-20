import { client } from "@/lib/prisma"
import { currentUser } from "@clerk/nextjs/server"

export const getCallerContext = async (workspaceId: string) => {
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