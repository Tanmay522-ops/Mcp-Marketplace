"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { acceptInvite, declineInvite } from "@/actions/invite"

type Props = {
    inviteId: string
}

const InviteResponseButtons = ({ inviteId }: Props) => {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)
    const [declined, setDeclined] = useState(false)

    const handleAccept = () => {
        setError(null)
        startTransition(async () => {
            try {
                const result = await acceptInvite(inviteId)
                if (result.status !== 200) {
                    setError(result.message ?? "Failed to accept invite")
                    return
                }
                // Refresh first so the sidebar workspace list includes the
                // new workspace, then navigate.
                router.refresh()
                router.push(`/dashboard/${result.data.workspaceId}`)
            } catch (err) {
                console.error("acceptInvite error:", err)
                setError("Something went wrong accepting the invite. Please try again.")
            }
        })
    }

    const handleDecline = () => {
        setError(null)
        startTransition(async () => {
            try {
                const result = await declineInvite(inviteId)
                if (result.status !== 200) {
                    setError(result.message ?? "Failed to decline invite")
                    return
                }
                setDeclined(true)
            } catch (err) {
                console.error("declineInvite error:", err)
                setError("Something went wrong declining the invite. Please try again.")
            }
        })
    }

    if (declined) {
        return <p className="text-[13px] text-muted-foreground">Invite declined.</p>
    }

    return (
        <div className="flex flex-col gap-2">
            <div className="flex gap-2">
                <button
                    onClick={handleDecline}
                    disabled={isPending}
                    className="flex-1 h-9 rounded-md border border-border/50 text-[13px] font-medium text-foreground/80 hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
                >
                    Decline
                </button>
                <button
                    onClick={handleAccept}
                    disabled={isPending}
                    className="flex-1 h-9 rounded-md bg-primary text-primary-foreground text-[13px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                    {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    Accept
                </button>
            </div>
            {error && <p className="text-[12px] text-red-500">{error}</p>}
        </div>
    )
}

export default InviteResponseButtons


