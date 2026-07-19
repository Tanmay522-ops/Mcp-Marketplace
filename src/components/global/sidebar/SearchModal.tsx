"use client"

import { useEffect } from 'react'
import { Search, Command, X } from 'lucide-react'

type Props = {
    open: boolean
    onClose: () => void
}

const SearchModal = ({ open, onClose }: Props) => {
    useEffect(() => {
        if (!open) return
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [open, onClose])

    if (!open) return null

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] sm:pt-[15vh] bg-background/40 backdrop-blur-sm px-4">
            <div className="absolute inset-0" onClick={onClose} />
            <div className="relative w-full max-w-xl bg-card border border-border/50 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center px-4 border-b border-border/50">
                    <Search className="w-[18px] h-[18px] text-muted-foreground/70 mr-3 shrink-0" strokeWidth={1.5} />
                    <input
                        autoFocus
                        className="flex-1 min-w-0 bg-transparent py-4 outline-none text-[14px] text-foreground placeholder:text-muted-foreground/50"
                        placeholder="Search tools, workspaces, or actions..."
                    />
                    <kbd
                        onClick={onClose}
                        className="hidden sm:inline-flex items-center justify-center h-5 px-1.5 ml-2 text-[10px] font-medium font-mono text-muted-foreground/70 bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 rounded-[4px] cursor-pointer hover:text-foreground hover:bg-black/10 dark:hover:bg-white/20 transition-colors"
                    >
                        ESC
                    </kbd>
                    <button
                        onClick={onClose}
                        className="ml-3 p-1 rounded-md text-muted-foreground/70 hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground transition-colors shrink-0"
                    >
                        <X className="w-[18px] h-[18px]" strokeWidth={1.5} />
                    </button>
                </div>
                <div className="p-2 py-8 flex flex-col items-center justify-center">
                    <Command className="w-6 h-6 text-muted-foreground/30 mb-2" strokeWidth={1.5} />
                    <p className="text-[13px] text-muted-foreground font-medium text-center px-4">
                        Type a command or search...
                    </p>
                </div>
            </div>
        </div>
    )
}

export default SearchModal