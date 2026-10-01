"use client"

import { useState } from "react"
import { useClerk } from "@clerk/nextjs"
import { Loader2 } from "lucide-react"

type Props = {
    redirectUrl: string
}

const SwitchAccountButton = ({ redirectUrl }: Props) => {
    const { signOut } = useClerk()
    const [pending, setPending] = useState(false)

    const handleClick = async () => {
        setPending(true)
        try {
            await signOut({ redirectUrl })
        } catch (err) {
            console.error("signOut error:", err)
            setPending(false)
        }
    }

    return (
        <button
            type="button"
            onClick={handleClick}
            disabled={pending}
            className="h-9 px-4 rounded-md border border-border/50 text-[13px] font-medium text-foreground/80 hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Sign out and use a different account
        </button>
    )
}

export default SwitchAccountButton