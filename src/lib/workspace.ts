// Shared by AuthCallbackPage and the dashboard workspace Layout so both
// pick a fallback workspace the exact same way, instead of each keeping
// its own separate copy of this calculation.
//
// Prefers a workspace the user owns; falls back to the first workspace
// they're a member of if they own none. Returns undefined if the user
// has no workspace at all.
type WorkspaceLike = { id: string }
type MembershipLike = { workspace: WorkspaceLike | null }

export function resolveDestinationWorkspaceId(user?: {
    ownedWorkspaces: WorkspaceLike[]
    memberships: MembershipLike[]
}): string | undefined {
    return user?.ownedWorkspaces[0]?.id ?? user?.memberships[0]?.workspace?.id
}