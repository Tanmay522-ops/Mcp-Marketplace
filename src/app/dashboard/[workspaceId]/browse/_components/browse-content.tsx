"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, Plus, Package, Loader2, Link2Off } from 'lucide-react'
import { searchMarketplaceTools, installTool, MarketplaceTool } from '@/actions/install'
import DeployPanel from './deploy-panel'

type Props = {
    workspaceId: string
    initialTools: MarketplaceTool[]
}

const BrowseContent = ({ workspaceId, initialTools }: Props) => {
    const router = useRouter()
    const queryClient = useQueryClient()
    const [query, setQuery] = useState('')
    const [installingId, setInstallingId] = useState<string | null>(null)
    const [isDeployOpen, setIsDeployOpen] = useState(false)

    const { data: result } = useQuery({
        queryKey: ['marketplace-tools', workspaceId, query],
        queryFn: () => searchMarketplaceTools(workspaceId, query || undefined),
        initialData: query ? undefined : { status: 200 as const, data: { tools: initialTools } },
    })

    const tools = result?.status === 200 ? result.data?.tools ?? [] : []
    const featured = tools.filter((tool) => tool.featured)
    const rest = tools.filter((tool) => !tool.featured)

    // Add just creates the install record and takes the user to the tool's
    // own page — it does NOT jump straight into the OAuth redirect chain.
    // The tool detail page owns the actual Authorize button. This matches
    // the flow: Add -> land on tool page -> user decides to click Authorize
    // from there, not automatically the instant they click Add.
    const handleInstall = async (toolVersionId: string, toolId: string) => {
        setInstallingId(toolVersionId)
        const res = await installTool({ workspaceId, toolVersionId })
        setInstallingId(null)

        if (res.status !== 201 || !res.data) {
            // TODO: surface res.message to the user (toast, inline error, etc.)
            console.error('installTool failed:', res.message)
            return
        }

        queryClient.invalidateQueries({ queryKey: ['marketplace-tools', workspaceId] })
        queryClient.invalidateQueries({ queryKey: ['workspace-installs', workspaceId] })
        router.push(`/dashboard/${workspaceId}/mcp/${toolId}`)
    }

    const goToToolPage = (toolId: string) => {
        router.push(`/dashboard/${workspaceId}/mcp/${toolId}`)
    }

    const renderAddButton = (tool: MarketplaceTool) => {
        const version = tool.versions[0]
        const install = version?.installs[0]

        if (!version) return null

        if (!install) {
            return (
                <button
                    onClick={() => handleInstall(version.id, tool.id)}
                    disabled={installingId === version.id}
                    className="h-7 px-3 rounded-md bg-primary text-primary-foreground text-[12px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1"
                >
                    {installingId === version.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    Add
                </button>
            )
        }

        // Every non-active status just navigates to the tool's own page —
        // that's where the real Authorize button and its "Connecting..."
        // state live, not here on the browse grid.
        if (install.status === 'NOT_CONNECTED') {
            return (
                <button
                    onClick={() => goToToolPage(tool.id)}
                    className="h-7 px-3 rounded-md border border-border/50 text-muted-foreground/70 text-[12px] font-medium hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center gap-1.5"
                >
                    <Link2Off className="w-3 h-3" strokeWidth={1.5} />
                    Connect
                </button>
            )
        }

        if (install.status === 'PENDING') {
            return (
                <button
                    onClick={() => goToToolPage(tool.id)}
                    className="h-7 px-3 rounded-md bg-amber-500/10 text-amber-500 text-[12px] font-medium hover:bg-amber-500/20 transition-colors flex items-center gap-1"
                >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    Pending
                </button>
            )
        }

        if (install.status === 'FAILED') {
            return (
                <button
                    onClick={() => goToToolPage(tool.id)}
                    className="h-7 px-3 rounded-md bg-red-500/10 text-red-500 text-[12px] font-medium hover:bg-red-500/20 transition-colors flex items-center gap-1"
                >
                    Retry
                </button>
            )
        }

        // ACTIVE
        return (
            <span className="h-7 px-3 rounded-md bg-emerald-500/10 text-emerald-500 text-[12px] font-medium flex items-center gap-1">
                ✓ Added
            </span>
        )
    }

    return (
        <>
            <div className="flex items-center justify-between mb-6">
                <div className="relative w-full max-w-xs">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search MCPs..."
                        className="w-full h-8 pl-8 pr-3 rounded-md bg-black/5 dark:bg-white/5 text-[12.5px] text-foreground placeholder:text-muted-foreground/50 outline-none border border-transparent focus:border-border"
                    />
                </div>
                <button
                    onClick={() => setIsDeployOpen(true)}
                    className="h-8 px-3.5 rounded-md bg-primary text-primary-foreground text-[13px] font-medium hover:bg-primary/90 transition-colors flex items-center gap-1.5"
                >
                    <Plus className="w-3.5 h-3.5" strokeWidth={2} />
                    Add custom
                </button>
            </div>

            {tools.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Package className="w-6 h-6 mb-2 text-muted-foreground/40" strokeWidth={1.5} />
                    <p className="text-[13px]">No MCPs found</p>
                </div>
            ) : (
                <>
                    {featured.length > 0 && (
                        <>
                            <p className="text-[13px] text-muted-foreground mb-3">Featured</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                                {featured.map((tool) => (
                                    <div
                                        key={tool.id}
                                        className="border border-border/50 rounded-lg p-4 flex flex-col gap-3 bg-card"
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-8 h-8 rounded-md bg-black/10 dark:bg-white/10 flex items-center justify-center overflow-hidden shrink-0">
                                                {tool.logoUrl ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img src={tool.logoUrl} alt={tool.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <Package className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
                                                )}
                                            </div>
                                            <span className="text-[13.5px] font-medium text-foreground truncate">{tool.name}</span>
                                        </div>
                                        <p className="text-[12px] text-muted-foreground line-clamp-2 flex-1">{tool.description}</p>
                                        <div>{renderAddButton(tool)}</div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {rest.length > 0 && (
                        <>
                            <p className="text-[13px] text-muted-foreground mb-3">All MCPs</p>
                            <div className="border border-border/50 rounded-lg overflow-hidden">
                                <div className="grid grid-cols-[1fr_2fr_auto] px-4 py-2.5 border-b border-border/50">
                                    <span className="text-[10.5px] font-semibold tracking-wider text-muted-foreground/50 uppercase">
                                        Name
                                    </span>
                                    <span className="text-[10.5px] font-semibold tracking-wider text-muted-foreground/50 uppercase">
                                        Description
                                    </span>
                                    <span />
                                </div>
                                <div className="divide-y divide-border/50">
                                    {rest.map((tool) => (
                                        <div key={tool.id} className="grid grid-cols-[1fr_2fr_auto] px-4 py-3 items-center gap-3">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <div className="w-5 h-5 rounded bg-black/10 dark:bg-white/10 flex items-center justify-center overflow-hidden shrink-0">
                                                    {tool.logoUrl ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img src={tool.logoUrl} alt={tool.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <Package className="w-3 h-3 text-muted-foreground" strokeWidth={1.5} />
                                                    )}
                                                </div>
                                                <span className="text-[13px] font-medium text-foreground truncate">{tool.name}</span>
                                            </div>
                                            <span className="text-[12.5px] text-muted-foreground truncate">{tool.description}</span>
                                            <div>{renderAddButton(tool)}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </>
            )}

            <DeployPanel workspaceId={workspaceId} open={isDeployOpen} onClose={() => setIsDeployOpen(false)} />
        </>
    )
}

export default BrowseContent