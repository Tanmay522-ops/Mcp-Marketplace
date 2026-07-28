"use client"

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import CopyButton from '@/components/global/copy-button'

type Props = {
    slug: string
    endpoint: string
    open: boolean
    onClose: () => void
}

const ConnectModal = ({ slug, endpoint, open, onClose }: Props) => {
    const [mounted, setMounted] = useState(false)
    useEffect(() => setMounted(true), [])

    if (!open || !mounted) return null

    const snippet = JSON.stringify({ mcpServers: { [slug]: { url: endpoint } } }, null, 2)

    const modal = (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/60 backdrop-blur-sm px-4">
            <div className="absolute inset-0" onClick={onClose} />
            <div className="relative w-full max-w-lg bg-card border border-border/50 rounded-xl shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 shrink-0">
                    <h2 className="text-[14px] font-medium text-foreground">Connect to this server</h2>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-md text-muted-foreground/70 hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground transition-colors"
                    >
                        <X className="w-4 h-4" strokeWidth={1.5} />
                    </button>
                </div>

                <div className="px-5 py-4">
                    <p className="text-[12.5px] text-muted-foreground mb-3">
                        Add this to your MCP client's config (Claude Code, Claude Desktop, Cursor, or any client
                        that supports Streamable HTTP servers).
                    </p>
                    <div className="relative">
                        <pre className="w-full font-mono text-[12px] leading-relaxed px-3 py-3 pr-10 rounded-md bg-black/5 dark:bg-white/5 text-foreground overflow-x-auto">
                            {snippet}
                        </pre>
                        <CopyButton value={snippet} className="absolute top-2 right-2" />
                    </div>
                </div>

                <div className="px-5 py-4 border-t border-border/50 flex gap-2 shrink-0">
                    <button
                        onClick={onClose}
                        className="flex-1 h-9 rounded-md border border-border/50 text-[13px] font-medium text-foreground/80 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    )

    return createPortal(modal, document.body)
}

export default ConnectModal
