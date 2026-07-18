"use server"

import { currentUser } from "@clerk/nextjs/server"
import { client } from "@/lib/prisma"

const generateWorkspaceSlug = (firstName: string | null, userId: string) => {
    const base = (firstName || "user")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
    const suffix = userId.slice(0, 6)
    return `${base}-${suffix}`
}

export const onAuthenticateUser = async () => {
    try {
        const authUser = await currentUser()

        if (!authUser) {
            return { status: 403, message: "Not authenticated" }
        }

        // Already synced? Return existing user + workspaces, no writes needed.
        const existingUser = await client.user.findUnique({
            where: { clerkId: authUser.id },
            include: {
                ownedWorkspaces: true,
                memberships: {
                    include: { workspace: true },
                },
            },
        })

        if (existingUser) {
            return { status: 200, user: existingUser }
        }

        const email = authUser.emailAddresses[0]?.emailAddress
        if (!email) {
            return { status: 400, message: "No email on Clerk user" }
        }

        const result = await client.$transaction(async (tx) => {
            const newUser = await tx.user.create({
                data: {
                    clerkId: authUser.id,
                    email,
                    firstName: authUser.firstName,
                    lastName: authUser.lastName,
                    imageUrl: authUser.imageUrl,
                },
            })

            const slug = generateWorkspaceSlug(newUser.firstName, newUser.id)

            const workspace = await tx.workspace.create({
                data: {
                    name: newUser.firstName
                        ? `${newUser.firstName}'s Workspace`
                        : "My Workspace",
                    slug,
                    ownerId: newUser.id,
                    members: {
                        create: {
                            userId: newUser.id,
                            role: "OWNER",
                        },
                    },
                },
            })

            return { newUser, workspace }
        })

        return {
            status: 201,
            user: {
                ...result.newUser,
                ownedWorkspaces: [result.workspace],
                memberships: [],
            },
        }
    } catch (error) {
        console.error("onAuthenticateUser error:", error)
        return { status: 500, message: "Internal error during authentication" }
    }
}