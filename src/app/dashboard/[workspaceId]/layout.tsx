import { onAuthenticateUser } from '@/actions/user'
import { getWorkspaceMembers, verifyAccessToWorkspace } from '@/actions/workspace'
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

    if (auth.status !== 200 && auth.status !== 201) {
        redirect('/callback')
    }

    const hasAccess = await verifyAccessToWorkspace(workspaceId)

    if (hasAccess.status !== 200) {
        redirect('/callback')
    }

    const ownedWorkspaces: WorkspaceSummary[] =
        auth.user?.ownedWorkspaces.map((ws) => ({
            id: ws.id,
            name: ws.name,
            slug: ws.slug,
            image: ws.image,
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
                image: ws.image,
                isOwner: false,
            })) ?? []

    const workspaces = [...ownedWorkspaces, ...memberWorkspaces]

    const query = new QueryClient()

    // await query.prefetchQuery({
    //     queryKey: ['workspace-members', workspaceId],
    //     queryFn: () => getWorkspaceMembers(workspaceId),
    // })

    return (
        <HydrationBoundary state={dehydrate(query)}>
            <DashboardShell activeWorkspaceId={workspaceId} workspaces={workspaces}>
                {children}
            </DashboardShell>
        </HydrationBoundary>
    )
}

export default Layout