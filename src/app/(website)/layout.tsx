
import React from 'react'
import LandingPageNavbar from './_components/navbar'
import { onAuthenticateUser } from '@/actions/user'
import { redirect} from 'next/navigation'
import { auth } from '@clerk/nextjs/server'

type Props = {
    children: React.ReactNode
}

const Layout = async({ children }: Props) => {

    const { userId } = await auth()

    if (userId) {
        const authResult = await onAuthenticateUser()

        if (authResult.status === 200 || authResult.status === 201) {
            const destinationWorkspaceId =
                authResult.user?.ownedWorkspaces[0]?.id ??
                authResult.user?.memberships[0]?.workspace.id

            redirect(`/callback`)
        }
    }
  
    
    return(
        <div className='flex flex-col py-5 px-6 xl:px-0 container'>
            <LandingPageNavbar/>
            {children}
        </div>
    )
}

export default Layout