"use client"

import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import InviteModal from './invite-modal'


type Props = {
    workspaceId: string
}

const InviteButton = ({ workspaceId }: Props) => {
    const [isOpen, setIsOpen] = useState(false)

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-[13px] font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
            >
                <UserPlus className="w-3.5 h-3.5" strokeWidth={2} />
                Invite to workspace
            </button>

            <InviteModal workspaceId={workspaceId} open={isOpen} onClose={() => setIsOpen(false)} />
        </>
    )
}

export default InviteButton