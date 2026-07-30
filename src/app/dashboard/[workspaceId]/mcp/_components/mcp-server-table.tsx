"use client"

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Search, ArrowUpDown, Package, Link2Off } from 'lucide-react'
import { getWorkspaceInstalls, InstallWithTool } from '@/actions/install'

type Props = {
    workspaceId: string
    initialInstalls: InstallWithTool[]
}

const statusDisplay: Record<string, { label: string; className: string }> = {
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
        <>
            <div className="flex items-center justify-between mb-4">
                <p className="text-[13px] text-muted-foreground">Servers deployed to your org.</p>
                <Link
                    href={`/dashboard/${workspaceId}/browse`}
                    className="h-8 px-3.5 rounded-md bg-primary text-primary-foreground text-[13px] font-medium hover:bg-primary/90 transition-colors flex items-center"
                >
                    Browse MCPs
                </Link>
            </div>

            <div className="w-full bg-card rounded-xl border border-border/50 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
                    <div className="relative w-full max-w-xs">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                        <input
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search servers..."
                            className="w-full h-8 pl-8 pr-3 rounded-md bg-black/5 dark:bg-white/5 text-[12.5px] text-foreground placeholder:text-muted-foreground/50 outline-none border border-transparent focus:border-border"
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
                        <div className="grid grid-cols-[2fr_1fr_1fr] px-4 py-2 border-b border-border/50">
                            <span className="text-[10.5px] font-semibold tracking-wider text-muted-foreground/50 uppercase flex items-center gap-1">
                                Server <ArrowUpDown className="w-3 h-3" />
                            </span>
                            <span className="text-[10.5px] font-semibold tracking-wider text-muted-foreground/50 uppercase flex items-center gap-1">
                                Status <ArrowUpDown className="w-3 h-3" />
                            </span>
                            <span className="text-[10.5px] font-semibold tracking-wider text-muted-foreground/50 uppercase flex items-center gap-1">
                                Created <ArrowUpDown className="w-3 h-3" />
                            </span>
                        </div>

                        <div className="divide-y divide-border/50">
                            {installs.map((install) => {
                                const display = statusDisplay[install.status] ?? statusDisplay.NOT_CONNECTED
                                const isNotConnected = install.status === 'NOT_CONNECTED'
                                return (
                                    <Link
                                        key={install.id}
                                        href={`/dashboard/${workspaceId}/mcp/${install.toolVersion.tool.id}`}
                                        className="grid grid-cols-[2fr_1fr_1fr] px-4 py-3 items-center hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <div className="w-6 h-6 rounded-md bg-black/10 dark:bg-white/10 flex items-center justify-center overflow-hidden shrink-0">
                                                {install.toolVersion.tool.logoUrl ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img
                                                        src={install.toolVersion.tool.logoUrl}
                                                        alt={install.toolVersion.tool.name}
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <Package className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={1.5} />
                                                )}
                                            </div>
                                            <span className="text-[13px] font-medium text-foreground truncate">
                                                {install.toolVersion.tool.name}
                                            </span>
                                        </div>

                                        <span className={`text-[13px] font-medium flex items-center gap-1.5 ${display.className}`}>
                                            {isNotConnected ? (
                                                <Link2Off className="w-3 h-3" strokeWidth={1.5} />
                                            ) : (
                                                <span className="w-1.5 h-1.5 rounded-full bg-current" />
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
        </>
    )
}

export default McpServersTable