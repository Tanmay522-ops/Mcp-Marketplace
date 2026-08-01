"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { Package, ExternalLink, BookOpen, Loader2, ArrowLeft } from 'lucide-react'

import { uninstallTool } from '@/actions/install'
import { getToolDetail, ToolDetail } from '@/actions/toll-actions'

type Props = {
    workspaceId: string
    toolId: string
    initialTool: ToolDetail
}

// Covers both InstallStatus ("PENDING") and DeploymentStatus
// ("PENDING"/"BUILDING"/"DEPLOYING") in-progress values — whichever of
// the two applies to this tool, keep polling until it lands somewhere
// final (ACTIVE/RUNNING/FAILED/ERROR/NOT_CONNECTED).
const IN_PROGRESS_STATUSES = new Set(['PENDING', 'BUILDING', 'DEPLOYING'])

const STATUS_DISPLAY: Record<string, { label: string; className: string }> = {
    NOT_CONNECTED: { label: 'Not connected', className: 'text-muted-foreground/60' },
    PENDING: { label: 'Pending', className: 'text-amber-500' },
    BUILDING: { label: 'Building', className: 'text-amber-500' },
    DEPLOYING: { label: 'Deploying', className: 'text-blue-500' },
    ACTIVE: { label: 'Running', className: 'text-emerald-500' },
    RUNNING: { label: 'Running', className: 'text-emerald-500' },
    FAILED: { label: 'Error', className: 'text-red-500' },
    ERROR: { label: 'Error', className: 'text-red-500' },
}

const ToolDetailContent = ({ workspaceId, toolId, initialTool }: Props) => {
    const router = useRouter()
    const queryClient = useQueryClient()
    const [uninstalling, setUninstalling] = useState(false)
    const [uninstallError, setUninstallError] = useState<string | null>(null)

    const { data: result } = useQuery({
        queryKey: ['tool-detail', workspaceId, toolId],
        queryFn: () => getToolDetail(workspaceId, toolId),
        initialData: { status: 200 as const, data: initialTool },
        refetchInterval: (query) => {
            const data = query.state.data?.status === 200 ? query.state.data.data : undefined
            const status = data?.deployment?.status ?? data?.install?.status
            return status && IN_PROGRESS_STATUSES.has(status) ? 3000 : false
        },
    })

    const tool = result?.status === 200 && result.data ? result.data : initialTool

    // Deployment status (custom Railway deploys) takes priority when one
    // exists — same precedence rule already used in mcp-server-table.tsx.
    const status = tool.deployment?.status ?? tool.install?.status ?? null
    const display = status ? STATUS_DISPLAY[status] : null

    const handleAuthorize = () => {
        window.location.href = `/api/oauth/authorize?workspaceId=${workspaceId}&toolId=${toolId}`
    }

    const handleUninstall = async () => {
        if (!tool.install) return
        setUninstalling(true)
        setUninstallError(null)
        const res = await uninstallTool(workspaceId, tool.install.id)
        setUninstalling(false)

        if (res.status === 200) {
            queryClient.invalidateQueries({ queryKey: ['workspace-installs', workspaceId] })
            router.push(`/dashboard/${workspaceId}/mcp`)
            return
        }

        setUninstallError(res.message ?? 'Failed to remove this tool — try again.')
    }

    const showAuthorizeButton =
        tool.requiresAuth &&
        (!tool.install || tool.install.status === 'NOT_CONNECTED' || tool.install.status === 'FAILED')

    return (
        <div className="max-w-2xl">
            <Link
                href={`/dashboard/${workspaceId}/mcp`}
                className="text-[12.5px] text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1"
            >
                <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.5} />
                Back to MCP servers
            </Link>

            <div className="flex items-start gap-3 mb-6">
                <div className="w-10 h-10 rounded-md bg-black/10 dark:bg-white/10 flex items-center justify-center overflow-hidden shrink-0">
                    {tool.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={tool.logoUrl} alt={tool.name} className="w-full h-full object-cover" />
                    ) : (
                        <Package className="w-5 h-5 text-muted-foreground" strokeWidth={1.5} />
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <h1 className="text-[18px] font-semibold text-foreground">{tool.name}</h1>
                    <p className="text-[13px] text-muted-foreground mt-0.5">{tool.description}</p>
                </div>
            </div>

            <div className="border border-border/50 rounded-lg p-4 mb-4 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                    <span className="text-[12.5px] text-muted-foreground">Status</span>
                    {display ? (
                        <span className={`inline-flex items-center gap-1.5 text-[13px] font-medium ${display.className}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${display.className} bg-current`} />
                            {display.label}
                        </span>
                    ) : (
                        <span className="text-[13px] text-muted-foreground/60">Not installed</span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {showAuthorizeButton && (
                        <button
                            onClick={handleAuthorize}
                            className="h-8 px-3.5 rounded-md bg-primary text-primary-foreground text-[13px] font-medium hover:bg-primary/90 transition-colors"
                        >
                            {tool.install?.status === 'FAILED' ? 'Retry' : 'Authorize'}
                        </button>
                    )}

                    {tool.install?.status === 'ACTIVE' && (
                        <button
                            onClick={handleUninstall}
                            disabled={uninstalling}
                            className="h-8 px-3.5 rounded-md border border-border/50 text-[13px] font-medium text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                        >
                            {uninstalling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                            Remove
                        </button>
                    )}
                </div>
            </div>

            {uninstallError && (
                <p className="text-[12.5px] text-red-500 mb-4">{uninstallError}</p>
            )}

            {tool.deployment?.status === 'ERROR' && tool.deployment.errorMessage && (
                <p className="text-[12.5px] text-red-500 mb-4">{tool.deployment.errorMessage}</p>
            )}

            {(tool.websiteUrl || tool.documentationUrl) && (
                <div className="flex items-center gap-4">
                    {tool.websiteUrl && (
                        <a
                            href={tool.websiteUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[12.5px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                        >
                            <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.5} />
                            Website
                        </a>
                    )}
                    {tool.documentationUrl && (
                        <a
                            href={tool.documentationUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[12.5px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                        >
                            <BookOpen className="w-3.5 h-3.5" strokeWidth={1.5} />
                            Docs
                        </a>
                    )}
                </div>
            )}
        </div>
    )
}

export default ToolDetailContent