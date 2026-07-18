import { onAuthenticateUser } from '@/actions/user'
import React from 'react'

type Props = {
    params: Promise<{ workspaceId: string }>
    children: React.ReactNode
}

const Layout = async ({ params, children }: Props) => {
    const { workspaceId } = await params
    const auth = await onAuthenticateUser()

    return <div>Layout</div>
}

export default Layout