"use server"

import { clerkClient, currentUser } from "@clerk/nextjs/server"
import { Prisma } from "@prisma/client"
import { client } from "@/lib/prisma"

// When someone signs up via Google/GitHub, Clerk's authUser.firstName comes
// straight from the provider's profile. When someone signs up with just
// email + password, there's no name collected anywhere, so firstName is
// null — this derives something reasonable from the email's local part
// instead of falling through to a generic "My Workspace" for everyone.
const deriveDisplayName = (firstName: string | null, email: string) => {
    if (firstName) return firstName
    const localPart = email.split("@")[0]
    const parts = localPart
        .split(/[._-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    return parts.join(" ") || "User"
}

const generateWorkspaceSlug = (displayName: string, userId: string) => {
    const base = displayName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
    const suffix = userId.slice(0, 6)
    return `${base}-${suffix}`
}

const workspaceInclude = {
    ownedWorkspaces: true,
    memberships: {
        include: { workspace: true },
    },
} as const

export const onAuthenticateUser = async () => {
    try {
        const authUser = await currentUser()

        if (!authUser) {
            return { status: 403, message: "Not authenticated" }
        }

        // Already synced? Return existing user + workspaces, no writes needed.
        const existingUser = await client.user.findUnique({
            where: { clerkId: authUser.id },
            include: workspaceInclude,
        })

        if (existingUser) {
            return { status: 200, user: existingUser }
        }

        // Was authUser.emailAddresses[0] — that's just the first email
        // Clerk has on file, not necessarily the verified/primary one. A
        // user with multiple email addresses could have had the wrong one
        // saved as their account email. primaryEmailAddress is the correct
        // field; falling back to [0] only if it's somehow unset.
        const email =
            authUser.primaryEmailAddress?.emailAddress ??
            authUser.emailAddresses[0]?.emailAddress

        if (!email) {
            return { status: 400, message: "No email on Clerk user" }
        }

        // A row can already exist under this email but a different
        // clerkId (stale dev-instance test account, a second identity
        // Clerk treats as distinct, etc). Decide explicitly instead of
        // letting it surface as an unhandled Prisma P2002.
        const emailConflict = await client.user.findUnique({
            where: { email },
        })

        if (emailConflict) {
            let oldClerkUserStillExists = true
            try {
                const clerk = await clerkClient()
                await clerk.users.getUser(emailConflict.clerkId)
            } catch (err) {
                const status = (err as { status?: number })?.status
                if (status === 404) {
                    oldClerkUserStillExists = false
                } else {
                    // Some other failure (network, rate limit, misconfigured key) —
                    // don't guess the account is deleted. Fail safely by treating
                    // this as a real conflict rather than risking a bad reclaim.
                    console.error("onAuthenticateUser: getUser check failed unexpectedly", err)
                    return {
                        status: 500,
                        message: "Could not verify account status. Please try again.",
                    }
                }
            }

            if (oldClerkUserStillExists) {
                return {
                    status: 409,
                    message: "An account with this email already exists. Please sign in with your original method.",
                }
            }

            const reclaimed = await client.user.update({
                where: { id: emailConflict.id },
                data: {
                    clerkId: authUser.id,
                    firstName: authUser.firstName,
                    lastName: authUser.lastName,
                    imageUrl: authUser.imageUrl,
                },
                include: workspaceInclude,
            })

            return { status: 200, user: reclaimed }
        }

        const displayName = deriveDisplayName(authUser.firstName, email)

        try {
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

                const slug = generateWorkspaceSlug(displayName, newUser.id)

                const workspace = await tx.workspace.create({
                    data: {
                        name: `${displayName}'s Workspace`,
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
        } catch (err) {
            // Race: two concurrent calls (e.g. the layout double-invoking
            // this) both passed the checks above before either committed.
            // Whichever loses the DB race lands here instead of crashing —
            // re-fetch and return the row the winner already created.
            if (
                err instanceof Prisma.PrismaClientKnownRequestError &&
                err.code === "P2002"
            ) {
                const winner = await client.user.findUnique({
                    where: { clerkId: authUser.id },
                    include: workspaceInclude,
                })
                if (winner) {
                    return { status: 200, user: winner }
                }
            }
            throw err
        }
    } catch (error) {
        console.error("onAuthenticateUser error:", error)
        return { status: 500, message: "Internal error during authentication" }
    }
}