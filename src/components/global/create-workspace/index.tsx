"use client"

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { X, Loader2 } from 'lucide-react'
import { createWorkspace } from '@/actions/workspace'

type Props = {
    open: boolean
    onClose: () => void
}

const CreateWorkspaceModal = ({ open, onClose }: Props) => {
    const router = useRouter()
    const [name, setName] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)

    // document isn't available during server rendering — only portal once
    // mounted in the browser, otherwise Next.js throws trying to
    // reference `document` on the server.
    const [mounted, setMounted] = useState(false)
    useEffect(() => setMounted(true), [])

    if (!open || !mounted) return null

    const handleClose = () => {
        setName('')
        setError(null)
        onClose()
    }

    const handleCreate = async () => {
        setError(null)
        if (!name.trim()) {
            setError('Enter a workspace name')
            return
        }

        setIsSubmitting(true)
        const result = await createWorkspace(name.trim())
        setIsSubmitting(false)

        if (result.status !== 201 || !result.data) {
            setError(result.message ?? 'Failed to create workspace')
            return
        }

        handleClose()
        router.push(`/dashboard/${result.data.id}`)
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleCreate()
        if (e.key === 'Escape') handleClose()
    }

    const modal = (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/60 backdrop-blur-sm px-4">
            <div className="absolute inset-0" onClick={handleClose} />
            <div className="relative w-full max-w-sm bg-card border border-border/50 rounded-xl shadow-2xl p-5 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-[14px] font-medium text-foreground">Create workspace</h2>
                    <button
                        onClick={handleClose}
                        className="p-1 rounded-md text-muted-foreground/70 hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground transition-colors"
                    >
                        <X className="w-4 h-4" strokeWidth={1.5} />
                    </button>
                </div>

                <label className="text-[12px] text-muted-foreground mb-1.5 block">Workspace name</label>
                <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Acme Corp"
                    className="w-full h-9 px-3 rounded-md bg-black/5 dark:bg-white/5 text-[13px] text-foreground placeholder:text-muted-foreground/50 outline-none border border-transparent focus:border-border"
                />
                {error && <p className="text-[12px] text-red-500 mt-2">{error}</p>}

                <div className="flex gap-2 mt-5">
                    <button
                        onClick={handleClose}
                        className="flex-1 h-9 rounded-md border border-border/50 text-[13px] font-medium text-foreground/80 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleCreate}
                        disabled={isSubmitting}
                        className="flex-1 h-9 rounded-md bg-primary text-primary-foreground text-[13px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                        {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                        Create
                    </button>
                </div>
            </div>
        </div>
    )

    return createPortal(modal, document.body)
}

export default CreateWorkspaceModal