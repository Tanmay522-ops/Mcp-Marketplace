"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Plus } from 'lucide-react'
import { WorkspaceSummary } from '../data/data'

type Props = {
    workspaces: WorkspaceSummary[]
    activeWorkspaceId: string
}

const WorkspaceSwitcher = ({ workspaces, activeWorkspaceId }: Props) => {
    const [isOpen, setIsOpen] = useState(false)
    const router = useRouter()
    
    const current = workspaces.find((ws) => ws.id === activeWorkspaceId) ?? workspaces[0]

    if (!current) return null

    const handleSelect = (workspaceId: string) => {
        setIsOpen(false)
        if (workspaceId !== activeWorkspaceId) {
            router.push(`/dashboard/${workspaceId}`)
        }
    }

    return (
        <div className="relative">
            <div
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center justify-between px-2 py-2 mb-4 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors select-none group"
            >
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-[6px] bg-primary text-primary-foreground flex items-center justify-center font-semibold text-[13px] shadow-sm overflow-hidden shrink-0">
                        {current.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={current.image} alt={current.name} className="w-full h-full object-cover" />
                        ) : (
                            current.name.charAt(0).toUpperCase()
                        )}
                    </div>
                    <div className="flex flex-col overflow-hidden">
                        <span className="text-[13px] font-medium leading-none mb-1 text-foreground truncate max-w-[120px]">
                            {current.name}
                        </span>
                    </div>
                </div>
                <ChevronDown
                    className="w-4 h-4 text-muted-foreground/50 group-hover:text-foreground/70 transition-colors shrink-0"
                    strokeWidth={1.5}
                />
            </div>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                    <div className="absolute top-[52px] left-0 w-full bg-card border border-border/50 rounded-lg shadow-xl z-50 py-1 flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-100">
                        {workspaces.map((ws) => (
                            <div
                                key={ws.id}
                                onClick={() => handleSelect(ws.id)}
                                className={`px-3 py-2 mx-1 text-[13px] rounded-md cursor-pointer transition-colors truncate ${ws.id === activeWorkspaceId
                                        ? 'bg-primary/10 text-primary font-medium'
                                        : 'text-foreground/80 hover:bg-black/5 dark:hover:bg-white/5'
                                    }`}
                            >
                                {ws.name}
                            </div>
                        ))}
                        <div className="h-px bg-border/50 my-1 mx-2" />
                        <div
                            onClick={() => {
                                setIsOpen(false)
                                router.push('/onboarding/create-workspace')
                            }}
                            className="px-3 py-2 mx-1 text-[13px] text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 rounded-md cursor-pointer flex items-center gap-2 transition-colors"
                        >
                            <Plus className="w-3.5 h-3.5" strokeWidth={2} /> Create Workspace
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}

export default WorkspaceSwitcher