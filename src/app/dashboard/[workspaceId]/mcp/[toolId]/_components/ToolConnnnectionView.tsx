"use client"

// Drop into your tool detail page (wherever that lives — not one of the
// files I have). Renders the connection UI for a tool that requires
// third-party auth, matching the 3 states from your screenshots:
//   NOT_CONNECTED -> bare centered card, no tabs (screenshots 2/3)
//   PENDING       -> full page + amber-ish "Authorize to connect" banner (screenshot 9)
//   ACTIVE        -> full page + "Ready to connect" banner (screenshot 6)

import { useState } from 'react'
import { Link2Off, KeyRound, RefreshCw, FlaskConical, Trash2, MoreVertical } from 'lucide-react'

type InstallStatus = 'NOT_CONNECTED' | 'PENDING' | 'ACTIVE'

type Props = {
    workspaceId: string
    toolId: string
    toolSlug: string
    toolName: string
    toolIcon?: React.ReactNode
    endpoint: string
    createdAt: string
    status: InstallStatus
    children?: React.ReactNode // Tabs/Identity/Observability content, passed through for PENDING/ACTIVE
}

const ToolConnectionView = ({
    workspaceId,
    toolId,
    toolSlug,
    toolName,
    toolIcon,
    endpoint,
    createdAt,
    status,
    children,
}: Props) => {
    const [connecting, setConnecting] = useState(false)

    // Full-page navigation on purpose — this has to leave the SPA and hit
    // the provider's real OAuth screen, not stay client-side.
    const handleAuthorize = () => {
        setConnecting(true)
        window.location.href = `/api/oauth/authorize?workspaceId=${workspaceId}&toolId=${toolId}`
    }

    // --- NOT_CONNECTED: bare card, no tabs at all (screenshots 2/3) ---
    if (status === 'NOT_CONNECTED') {
        return (
            <div>
                <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-black/10 dark:bg-white/10 flex items-center justify-center">
                            {toolIcon}
                        </div>
                        <div>
                            <h1 className="text-[18px] font-semibold text-foreground">{toolName}</h1>
                            <p className="text-[12px] text-muted-foreground font-mono">{toolSlug}</p>
                        </div>
                    </div>
                    <button className="h-8 px-3 rounded-md border border-border/50 text-[12.5px] font-medium text-red-500 hover:bg-red-500/5 transition-colors">
                        Remove
                    </button>
                </div>

                <div className="border border-border/50 rounded-lg py-16 flex flex-col items-center">
                    <div className="w-11 h-11 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center mb-4">
                        <Link2Off className="w-5 h-5 text-muted-foreground/60" strokeWidth={1.5} />
                    </div>
                    <h2 className="text-[15px] font-semibold text-foreground mb-1.5">Connect your account</h2>
                    <p className="text-[13px] text-muted-foreground mb-5 text-center max-w-sm">
                        Connect your own account — your credentials stay private to you. Authorize below to
                        connect.
                    </p>
                    <button
                        onClick={handleAuthorize}
                        disabled={connecting}
                        className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-[13px] font-medium disabled:opacity-60 flex items-center gap-2"
                    >
                        <KeyRound className="w-3.5 h-3.5" strokeWidth={1.5} />
                        {connecting ? 'Connecting…' : 'Authorize'}
                    </button>
                </div>
            </div>
        )
    }

    // --- PENDING / ACTIVE: full page layout with a banner (screenshots 6/9) ---
    const isActive = status === 'ACTIVE'

    return (
        <div>
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-black/10 dark:bg-white/10 flex items-center justify-center">
                        {toolIcon}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-[18px] font-semibold text-foreground">{toolName}</h1>
                            <span
                                className={`inline-flex items-center gap-1 text-[11.5px] font-medium ${isActive ? 'text-emerald-500' : 'text-amber-500'}`}
                            >
                                <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                {isActive ? 'Running' : 'Pending'}
                            </span>
                        </div>
                        <p className="text-[12px] text-muted-foreground font-mono">{endpoint}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button className="h-8 px-3 rounded-md border border-border/50 text-[12.5px] font-medium text-foreground/80 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                        + Connect
                    </button>
                    {isActive ? (
                        <>
                            <button className="h-8 px-3 rounded-md border border-border/50 text-[12.5px] font-medium text-foreground/80 flex items-center gap-1.5">
                                <FlaskConical className="w-3.5 h-3.5" strokeWidth={1.5} /> Test
                            </button>
                            <button className="h-8 px-3 rounded-md border border-border/50 text-[12.5px] font-medium text-foreground/80 flex items-center gap-1.5">
                                <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} /> Refresh
                            </button>
                            <button
                                onClick={handleAuthorize}
                                className="h-8 px-3 rounded-md border border-border/50 text-[12.5px] font-medium text-foreground/80 flex items-center gap-1.5"
                            >
                                <KeyRound className="w-3.5 h-3.5" strokeWidth={1.5} /> Re-authenticate
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={handleAuthorize}
                            disabled={connecting}
                            className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-[12.5px] font-medium disabled:opacity-60 flex items-center gap-1.5"
                        >
                            <KeyRound className="w-3.5 h-3.5" strokeWidth={1.5} />
                            {connecting ? 'Connecting…' : 'Authorize'}
                        </button>
                    )}
                    <button className="h-8 w-8 rounded-md border border-border/50 flex items-center justify-center text-muted-foreground/70">
                        <MoreVertical className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                </div>
            </div>

            <div
                className={`flex items-center justify-between rounded-lg px-4 py-3 mb-5 ${isActive ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-emerald-500/10 border border-emerald-500/20'
                    }`}
            >
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-[13px] font-semibold text-foreground">
                        {isActive ? 'Ready to connect' : 'Authorize to connect'}
                    </span>
                    <span className="text-[13px] text-muted-foreground">
                        {isActive
                            ? 'Install this server in Claude Code, Desktop, Cursor, or any MCP client.'
                            : 'This server requires authorization before it can be used.'}
                    </span>
                </div>
                {!isActive && (
                    <button
                        onClick={handleAuthorize}
                        disabled={connecting}
                        className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-[12.5px] font-medium disabled:opacity-60 flex items-center gap-1.5"
                    >
                        <KeyRound className="w-3.5 h-3.5" strokeWidth={1.5} />
                        {connecting ? 'Connecting…' : 'Authorize'}
                    </button>
                )}
            </div>

            {/* Tabs / Identity / Observability — your existing detail-page content
                still renders here regardless of PENDING vs ACTIVE. */}
            {children}
        </div>
    )
}

export default ToolConnectionView