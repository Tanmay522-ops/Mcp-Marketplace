"use client"

import { useState } from 'react'

import { createPortal } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Mail, Loader2, Copy, Check } from 'lucide-react'
import { getWorkspaceInvites, revokeInvite, sendInvite } from '@/actions/invite'
import { useMounted } from '@/hooks/use-mouneted'

type Props = {
    workspaceId: string
    open: boolean
    onClose: () => void
}

const InviteModal = ({ workspaceId, open, onClose }: Props) => {
    const queryClient = useQueryClient()
    const [email, setEmail] = useState('')
    const [role, setRole] = useState<'ADMIN' | 'MEMBER'>('MEMBER')
    const [error, setError] = useState<string | null>(null)
    const [notice, setNotice] = useState<string | null>(null)
    const [isSending, setIsSending] = useState(false)
    const [revokingId, setRevokingId] = useState<string | null>(null)
    const [revokeError, setRevokeError] = useState<string | null>(null)
    const [copiedId, setCopiedId] = useState<string | null>(null)

    const mounted = useMounted()

    // Only fetch while the modal is actually open.
    const { data: result, isLoading, isError } = useQuery({
        queryKey: ['workspace-invites', workspaceId],
        queryFn: () => getWorkspaceInvites(workspaceId),
        enabled: open,
    })

    if (!open || !mounted) return null

    const invites = result?.status === 200 ? result.data?.invites ?? [] : []
    const loadFailed = isError || (result !== undefined && result.status !== 200)

    const handleClose = () => {
        setEmail('')
        setError(null)
        setNotice(null)
        setRevokeError(null)
        setCopiedId(null)
        onClose()
    }

    const handleSend = async () => {
        setError(null)
        setNotice(null)
        if (!email.trim()) {
            setError('Enter an email address')
            return
        }

        setIsSending(true)
        try {
            const res = await sendInvite({ workspaceId, email: email.trim(), role })

            if (res.status !== 201) {
                setError(res.message ?? 'Failed to send invite')
                return
            }

            setEmail('')
            if (!res.emailSent) {
                setNotice('Invite created, but the email failed to send — use the copy button below to share the link.')
            }
            // Refetch the pending list so the new invite shows up immediately.
            queryClient.invalidateQueries({ queryKey: ['workspace-invites', workspaceId] })
        } catch (err) {
            console.error('sendInvite error:', err)
            setError('Something went wrong sending the invite. Please try again.')
        } finally {
            setIsSending(false)
        }
    }

    const handleRevoke = async (inviteId: string) => {
        setRevokeError(null)
        setRevokingId(inviteId)
        try {
            const res = await revokeInvite(workspaceId, inviteId)
            if (res.status === 200) {
                queryClient.invalidateQueries({ queryKey: ['workspace-invites', workspaceId] })
            } else {
                setRevokeError(res.message ?? 'Failed to revoke invite')
            }
        } catch (err) {
            console.error('revokeInvite error:', err)
            setRevokeError('Something went wrong revoking the invite. Please try again.')
        } finally {
            setRevokingId(null)
        }
    }

    const handleCopy = async (inviteId: string) => {
        try {
            await navigator.clipboard.writeText(`${window.location.origin}/invite/${inviteId}`)
            setCopiedId(inviteId)
            setTimeout(() => setCopiedId((current) => (current === inviteId ? null : current)), 2000)
        } catch (err) {
            console.error('copy invite link error:', err)
            setRevokeError('Could not copy the link. Copy it manually from the address format /invite/<id>.')
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !isSending) handleSend()
        if (e.key === 'Escape') handleClose()
    }

    const modal = (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/60 backdrop-blur-sm px-4">
            <div className="absolute inset-0" onClick={handleClose} />
            <div className="relative w-full max-w-md bg-card border border-border/50 rounded-xl shadow-2xl p-5 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-[14px] font-medium text-foreground">Invite to workspace</h2>
                    <button
                        onClick={handleClose}
                        className="p-1 rounded-md text-muted-foreground/70 hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground transition-colors"
                    >
                        <X className="w-4 h-4" strokeWidth={1.5} />
                    </button>
                </div>

                {/* Send form */}
                <div className="flex flex-col sm:flex-row gap-2">
                    <input
                        autoFocus
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="teammate@example.com"
                        className="flex-1 h-9 px-3 rounded-md bg-black/5 dark:bg-white/5 text-[13px] text-foreground placeholder:text-muted-foreground/50 outline-none border border-transparent focus:border-border"
                    />
                    <select
                        value={role}
                        onChange={(e) => setRole(e.target.value as 'ADMIN' | 'MEMBER')}
                        className="h-9 px-3 rounded-md bg-black/5 dark:bg-white/5 text-[13px] text-foreground outline-none border border-transparent focus:border-border"
                    >
                        <option value="MEMBER">Member</option>
                        <option value="ADMIN">Admin</option>
                    </select>
                    <button
                        onClick={handleSend}
                        disabled={isSending}
                        className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-[13px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 shrink-0"
                    >
                        {isSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                        Send
                    </button>
                </div>
                {error && <p className="text-[12px] text-red-500 mt-2">{error}</p>}
                {notice && <p className="text-[12px] text-amber-500 mt-2">{notice}</p>}

                {/* Pending invites */}
                <div className="mt-5">
                    <span className="text-[10px] font-semibold tracking-wider text-muted-foreground/50 uppercase">
                        Pending invites
                    </span>

                    {revokeError && <p className="text-[12px] text-red-500 mt-2">{revokeError}</p>}

                    <div className="mt-2 rounded-lg border border-border/50 overflow-hidden max-h-[220px] overflow-y-auto">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-8 text-muted-foreground">
                                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                            </div>
                        ) : loadFailed ? (
                            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                                <Mail className="w-5 h-5 mb-1.5 text-muted-foreground/40" strokeWidth={1.5} />
                                <p className="text-[12px]">Couldn't load invites. Try reopening this panel.</p>
                            </div>
                        ) : invites.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                                <Mail className="w-5 h-5 mb-1.5 text-muted-foreground/40" strokeWidth={1.5} />
                                <p className="text-[12px]">No pending invites</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-border/50">
                                {invites.map((invite) => (
                                    <div key={invite.id} className="flex items-center justify-between px-3 py-2.5 gap-2">
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-[12.5px] font-medium text-foreground truncate">{invite.email}</span>
                                            <span className="text-[11px] text-muted-foreground truncate">
                                                Invited as {invite.role.toLowerCase()}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                onClick={() => handleCopy(invite.id)}
                                                className="p-1 rounded-md text-muted-foreground/60 hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground transition-colors"
                                                title="Copy invite link"
                                            >
                                                {copiedId === invite.id ? (
                                                    <Check className="w-3.5 h-3.5 text-green-500" strokeWidth={1.5} />
                                                ) : (
                                                    <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />
                                                )}
                                            </button>
                                            <button
                                                onClick={() => handleRevoke(invite.id)}
                                                disabled={revokingId === invite.id}
                                                className="p-1 rounded-md text-muted-foreground/60 hover:bg-red-500/10 hover:text-red-500 transition-colors disabled:opacity-50"
                                                title="Revoke invite"
                                            >
                                                {revokingId === invite.id ? (
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                    <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )

    // Portal to <body> so the sidebar's transformed drawer wrapper doesn't
    // confine the `fixed` overlay to its own box.
    return createPortal(modal, document.body)
}

export default InviteModal