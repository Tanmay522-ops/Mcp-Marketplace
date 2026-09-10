import { onAuthenticateUser } from '@/actions/user'
import { verifyAccessToWorkspace } from '@/actions/workspace'
import { resolveDestinationWorkspaceId } from '@/lib/workspace'
import { redirect } from 'next/navigation'
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'

import React from 'react'

import { WorkspaceSummary } from '@/components/global/data/data'
import DashboardShell from '@/components/global/DashboardShell'

type Props = {
    params: Promise<{ workspaceId: string }>
    children: React.ReactNode
}

const Layout = async ({ params, children }: Props) => {
    const { workspaceId } = await params

    const auth = await onAuthenticateUser()

    // 403 means there's no valid session at all — /callback would just
    // re-run onAuthenticateUser and land on the exact same 403, so send
    // straight home instead of paying for a redundant round-trip.
    if (auth.status === 403) {
        redirect('/')
    }

    // Any other non-success status (409 conflict, 400, 500) still needs
    // /callback's own recovery logic (reopening the sign-in modal, showing
    // the right toast, etc.), so route there rather than handling it here.
    if (auth.status !== 200 && auth.status !== 201) {
        redirect('/callback')
    }

    let hasAccess: Awaited<ReturnType<typeof verifyAccessToWorkspace>>
    try {
        hasAccess = await verifyAccessToWorkspace(workspaceId)
    } catch (err) {
        console.error('[dashboard layout] verifyAccessToWorkspace threw', err)
        redirect('/callback')
    }

    // User is authenticated but doesn't have access to THIS workspace
    // (e.g. a stale or guessed URL, or they were removed from it). We
    // already have this user's full workspace list in memory from the
    // onAuthenticateUser() call above, so we can pick a valid fallback
    // workspace directly — no need to redirect through /callback and pay
    // for a second, redundant onAuthenticateUser() call just to re-derive
    // data we already have.
    if (hasAccess.status !== 200) {
        const fallbackWorkspaceId = resolveDestinationWorkspaceId(auth.user)

        if (fallbackWorkspaceId) {
            redirect(`/dashboard/${fallbackWorkspaceId}`)
        }

        // Genuinely has no workspace at all — this really is the
        // exceptional case /callback's own error handling is meant for.
        redirect('/callback')
    }

    const ownedWorkspaces: WorkspaceSummary[] =
        auth.user?.ownedWorkspaces.map((ws) => ({
            id: ws.id,
            name: ws.name,
            slug: ws.slug,
            image: ws.image ?? null,
            isOwner: true,
        })) ?? []

    const memberWorkspaces: WorkspaceSummary[] =
        auth.user?.memberships
            .map((m) => m.workspace)
            .filter((ws) => !ownedWorkspaces.some((owned) => owned.id === ws.id))
            .map((ws) => ({
                id: ws.id,
                name: ws.name,
                slug: ws.slug,
                image: ws.image ?? null,
                isOwner: false,
            })) ?? []

    const workspaces = [...ownedWorkspaces, ...memberWorkspaces]

    const query = new QueryClient()

    return (
        <HydrationBoundary state={dehydrate(query)}>
            <DashboardShell activeWorkspaceId={workspaceId} workspaces={workspaces}>
                {children}
            </DashboardShell>
        </HydrationBoundary>
    )
}

export default Layout