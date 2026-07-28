"use client"

import { useState } from 'react'
import { Plug } from 'lucide-react'
import ConnectModal from './connect-modal'

type Props = {
    slug: string
    endpoint: string
}

const ConnectButton = ({ slug, endpoint }: Props) => {
    const [open, setOpen] = useState(false)

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-[12.5px] font-medium hover:bg-primary/90 transition-colors flex items-center gap-1.5"
            >
                <Plug className="w-3.5 h-3.5" strokeWidth={1.5} />
                Connect
            </button>
            <ConnectModal slug={slug} endpoint={endpoint} open={open} onClose={() => setOpen(false)} />
        </>
    )
}

export default ConnectButton
