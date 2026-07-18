import { onAuthenticateUser } from '@/actions/user'
import { redirect } from 'next/navigation'
import React from 'react'

const AuthCallbackPage = async () => {

    const auth = await onAuthenticateUser()

    console.log("AUTH RESULT:", auth)

    if (auth.status === 200 || auth.status === 201) {
        const destinationWorkspaceId =
            auth.user?.ownedWorkspaces[0]?.id ?? auth.user?.memberships[0]?.workspace.id
        return redirect(`/dashboard/${destinationWorkspaceId}`)
    }

    if (auth.status === 403 || auth.status === 400 || auth.status === 500) {
        return redirect('/sign-in')
    }
}

export default AuthCallbackPage