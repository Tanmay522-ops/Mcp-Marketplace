import { onAuthenticateUser } from '@/actions/user'
import { verifyAccessToWorkspace } from '@/actions/workspace'
import { redirect } from 'next/navigation'

import React from 'react'

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

    
    return <div>Layout</div>
}

export default Layout