"use client"

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MoreHorizontal, Crown, Loader2 } from 'lucide-react'
import { getWorkspaceMembers, removeMember, updateMemberRole } from '@/actions/member'

type MembersResult = Awaited<ReturnType<typeof getWorkspaceMembers>>
type MembersData = Extract<MembersResult, { data: unknown }>['data']
type MemberRow = MembersData['members'][number]

type Props = {
    workspaceId: string
    callerId: string
    initialData?: MembersData
}


const roleBadgeStyles: Record<string, string> = {
    OWNER: 'bg-primary/10 text-primary',
    ADMIN: 'bg-blue-500/10 text-blue-500',
    MEMBER: 'bg-black/5 dark:bg-white/10 text-muted-foreground',
}

const MembersTable = ({ workspaceId, callerId, initialData }: Props) => {
    const [openMenuId, setOpenMenuId] = useState<string | null>(null)
    const [pendingId, setPendingId] = useState<string | null>(null)
    const menuRef = useRef<HTMLDivElement | null>(null)
    const queryClient = useQueryClient()

    const queryKey = ['workspace-members', workspaceId]

    const { data: result, isLoading, isError } = useQuery({
        queryKey,
        queryFn: () => getWorkspaceMembers(workspaceId),
        initialData: initialData
            ? (): MembersResult => ({ status: 200, data: initialData })
            : undefined,
    })

    // Close menu on Escape
    useEffect(() => {
        if (!openMenuId) return
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpenMenuId(null)
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [openMenuId])

    const roleMutation = useMutation({
        mutationFn: ({ memberId, role }: { memberId: string; role: "ADMIN" | "MEMBER" }) =>
            updateMemberRole(workspaceId, memberId, role),
        onMutate: ({ memberId }) => setPendingId(memberId),
        onSettled: () => setPendingId(null),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey })
            setOpenMenuId(null)
        },
    })

    const removeMutation = useMutation({
        mutationFn: (memberId: string) => removeMember(workspaceId, memberId),
        onMutate: (memberId) => setPendingId(memberId),
        onSettled: () => setPendingId(null),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey })
            setOpenMenuId(null)
        },
    })

    if (isLoading && !result) {
        return (
            <div className="w-full bg-card rounded-xl border border-border/50 shadow-sm p-8 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.5} />
                <p className="text-[13px]">Loading members...</p>
            </div>
        )
    }

    if (isError || !result || result.status !== 200 || !result.data) {
        return (
            <div className="w-full bg-card rounded-xl border border-border/50 shadow-sm p-8 text-center">
                <p className="text-[13px] text-muted-foreground">
                    {result && 'message' in result ? result.message : 'Unable to load members.'}
                </p>
            </div>
        )
    }

    const { members, callerRole } = result.data
    const canManage = callerRole === 'OWNER' || callerRole === 'ADMIN'

    const displayName = (member: MemberRow) => {
        const { firstName, lastName, email } = member.user
        if (firstName || lastName) return [firstName, lastName].filter(Boolean).join(' ')
        return email
    }

    return (
        <div className="w-full bg-card rounded-xl border border-border/50 shadow-sm">
            <div className="divide-y divide-border/50">
                {members.map((member) => {
                    const isSelf = member.userId === callerId
                    const isOwnerRow = member.role === 'OWNER'
                    const isBusy = pendingId === member.id

                    return (
                        <div key={member.id} className="flex items-center justify-between px-5 py-3.5 group">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold text-[12px] shadow-sm overflow-hidden shrink-0">
                                    {member.user.imageUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={member.user.imageUrl}
                                            alt={displayName(member)}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        displayName(member).charAt(0).toUpperCase()
                                    )}
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <span className="text-[13px] font-medium text-foreground truncate flex items-center gap-1.5">
                                        {displayName(member)}
                                        {isSelf && <span className="text-muted-foreground font-normal">(you)</span>}
                                    </span>
                                    <span className="text-[12px] text-muted-foreground truncate">{member.user.email}</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                                <span
                                    className={`flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${roleBadgeStyles[member.role] ?? roleBadgeStyles.MEMBER}`}
                                >
                                    {isOwnerRow && <Crown className="w-3 h-3" strokeWidth={2} />}
                                    {member.role}
                                </span>

                                {canManage && !isOwnerRow && !isSelf && (
                                    <div className="relative" ref={openMenuId === member.id ? menuRef : undefined}>
                                        <button
                                            onClick={() => setOpenMenuId(openMenuId === member.id ? null : member.id)}
                                            disabled={isBusy}
                                            className="p-1 rounded-md text-muted-foreground/60 opacity-0 group-hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground transition-all disabled:opacity-50"
                                        >
                                            {isBusy ? (
                                                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                                            ) : (
                                                <MoreHorizontal className="w-4 h-4" strokeWidth={1.5} />
                                            )}
                                        </button>

                                        {openMenuId === member.id && (
                                            <>
                                                <div className="fixed inset-0 z-40" onClick={() => setOpenMenuId(null)} />
                                                <div className="absolute top-7 right-0 w-40 bg-card border border-border/50 rounded-lg shadow-xl z-50 py-1 flex flex-col">
                                                    <button
                                                        onClick={() =>
                                                            roleMutation.mutate({
                                                                memberId: member.id,
                                                                role: member.role === 'ADMIN' ? 'MEMBER' : 'ADMIN',
                                                            })
                                                        }
                                                        disabled={roleMutation.isPending}
                                                        className="px-3 py-2 text-[13px] text-left text-foreground/80 hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
                                                    >
                                                        {member.role === 'ADMIN' ? 'Demote to Member' : 'Promote to Admin'}
                                                    </button>
                                                    <button
                                                        onClick={() => removeMutation.mutate(member.id)}
                                                        disabled={removeMutation.isPending}
                                                        className="px-3 py-2 text-[13px] text-left text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                                                    >
                                                        Remove from workspace
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

export default MembersTable