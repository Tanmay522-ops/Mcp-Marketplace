"use client"

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Search, ArrowUpDown, Package, Link2Off } from 'lucide-react'
import { getWorkspaceInstalls, InstallWithTool } from '@/actions/install'
import { deploymentStatusDisplay } from '@/lib/deployment-status'

type Props = {
    workspaceId: string
    initialInstalls: InstallWithTool[]
}

// install.status always has a meaningful value regardless of whether the
// tool requires auth — installTool sets NOT_CONNECTED, ACTIVE, or PENDING
// at install time in every case (see install-actions.ts). So this is the
// single fallback for any tool with no Deployment row — no separate
// placeholder needed for tools that don't require auth.
const connectionStatusDisplay: Record<string, { label: string; className: string }> = {
    NOT_CONNECTED: { label: 'Not connected', className: 'text-muted-foreground/60' },
    PENDING: { label: 'Pending', className: 'text-amber-500' },
    ACTIVE: { label: 'Running', className: 'text-emerald-500' },
    FAILED: { label: 'Error', className: 'text-red-500' },
}

const McpServersTable = ({ workspaceId, initialInstalls }: Props) => {
    const [searchTerm, setSearchTerm] = useState('')

    const { data: result } = useQuery({
        queryKey: ['workspace-installs', workspaceId],
        queryFn: () => getWorkspaceInstalls(workspaceId),
        initialData: { status: 200 as const, data: { installs: initialInstalls } },
    })

    const allInstalls = result?.status === 200 ? result.data?.installs ?? [] : []
    const installs = searchTerm
        ? allInstalls.filter((i) => i.toolVersion.tool.name.toLowerCase().includes(searchTerm.toLowerCase()))
        : allInstalls

    return (
        <div className="w-full rounded-xl border border-border/50 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
                <div className="relative w-full max-w-xs">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                    <input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search servers..."
                        className="w-full h-8 pl-8 pr-3 rounded-md bg-black/5 dark:bg-white/5 text-[12.5px] text-foreground placeholder:text-muted-foreground/50 outline-none border border-transparent focus:border-pink-400 focus:ring-2 focus:ring-pink-400/30 transition-colors"
                    />
                </div>
                <span className="text-[11px] font-mono text-muted-foreground shrink-0 ml-3">
                    {installs.length} {installs.length === 1 ? 'server' : 'servers'}
                </span>
            </div>

            {installs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Package className="w-6 h-6 mb-2 text-muted-foreground/40" strokeWidth={1.5} />
                    <p className="text-[13px]">
                        {searchTerm ? 'No servers match your search' : 'No servers installed yet'}
                    </p>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-[2fr_1fr_1fr] px-4 py-4 border-b border-border/50">
                        <span className="text-[13.5px] font-semibold tracking-wider text-muted-foreground/50 uppercase flex items-center gap-1">
                            Server <ArrowUpDown className="w-5 h-4" />
                        </span>
                        <span className="text-[13.5px] font-semibold tracking-wider text-muted-foreground/50 uppercase flex items-center gap-1">
                            Status <ArrowUpDown className="w-5 h-4" />
                        </span>
                        <span className="text-[13.5px] font-semibold tracking-wider text-muted-foreground/50 uppercase flex items-center gap-1">
                            Created <ArrowUpDown className="w-5 h-4" />
                        </span>
                    </div>

                    <div className="divide-y divide-border/30 bg-card">
                        {installs.map((install) => {
                            const tool = install.toolVersion.tool
                            const deployment = tool.deployments[0]

                            // Two cases only: a real deployment's status
                            // takes priority when one exists; otherwise
                            // the connection's own status is the truth.
                            const display = deployment
                                ? deploymentStatusDisplay[deployment.status] ?? connectionStatusDisplay.FAILED
                                : connectionStatusDisplay[install.status] ?? connectionStatusDisplay.FAILED
                            const isNotConnected = !deployment && install.status === 'NOT_CONNECTED'

                            return (
                                <Link
                                    key={install.id}
                                    href={`/dashboard/${workspaceId}/mcp/${tool.id}`}
                                    className="grid grid-cols-[2fr_1fr_1fr] px-4 py-3 items-center hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                                >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="w-6 h-6 rounded-md bg-black/10 dark:bg-white/10 flex items-center justify-center overflow-hidden shrink-0">
                                            {tool.logoUrl ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img
                                                    src={tool.logoUrl}
                                                    alt={tool.name}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <Package className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={1.5} />
                                            )}
                                        </div>
                                        <span className="text-[13px] font-semibold text-foreground truncate">
                                            {tool.name}
                                        </span>
                                    </div>

                                    <span className="text-[13px] font-semibold text-foreground flex items-center gap-1.5">
                                        {isNotConnected ? (
                                            <Link2Off className={`w-3 h-3 ${display.className}`} strokeWidth={1.5} />
                                        ) : (
                                            <span className={`w-1.5 h-1.5 rounded-full ${display.className} bg-current`} />
                                        )}
                                        {display.label}
                                    </span>

                                    <span className="text-[12.5px] font-mono text-muted-foreground">
                                        {new Date(install.installedAt).toLocaleDateString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            year: 'numeric',
                                        })}
                                    </span>
                                </Link>
                            )
                        })}
                    </div>
                </>
            )}
        </div>
    )
}

export default McpServersTable