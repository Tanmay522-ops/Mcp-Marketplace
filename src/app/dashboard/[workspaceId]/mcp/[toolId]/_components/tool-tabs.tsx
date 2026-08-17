"use client"

import { toast } from 'sonner'
import { Copy, BarChart3, X } from 'lucide-react'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty'

export type TabKey = 'overview' | 'variables' | 'tools' | 'logs'

const TAB_LABELS: Record<TabKey, string> = {
    overview: 'Overview',
    variables: 'Variables',
    tools: 'Tools',
    logs: 'Logs',
}

type Props = {
    tabs: TabKey[]
    overview?: { endpoint: string; createdAt: Date } | null
    // Shown inside the Overview tab, below the Identity/Observability
    // cards — not below the tab bar regardless of which tab is open.
    showConnectBanner?: boolean
    onDismissConnectBanner?: () => void
}

const ToolTabs = ({ tabs, overview, showConnectBanner, onDismissConnectBanner }: Props) => {
    const handleCopy = () => {
        if (!overview) return
        navigator.clipboard.writeText(overview.endpoint)
        toast('Endpoint copied to clipboard')
    }

    return (
        <Tabs defaultValue={tabs[0]}>
            <TabsList>
                {tabs.map((tab) => (
                    <TabsTrigger key={tab} value={tab}>
                        {TAB_LABELS[tab]}
                    </TabsTrigger>
                ))}
            </TabsList>

            {tabs.map((tab) => (
                <TabsContent key={tab} value={tab}>
                    {tab === 'overview' ? (
                        <div className="flex flex-col gap-4 mt-2">
                            {showConnectBanner && (
                                <div className="flex items-center justify-between rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-3">
                                    <div className="flex items-center gap-2.5">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                        <div>
                                            <p className="text-[13px] font-semibold text-foreground">Ready to connect</p>
                                            <p className="text-[12px] text-muted-foreground">
                                                Install this server in Claude Code, Desktop, Cursor, or any MCP client.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button size="sm" onClick={() => toast('Coming soon — not wired up yet.')}>
                                            Connect with…
                                        </Button>
                                        {onDismissConnectBanner && (
                                            <button
                                                onClick={onDismissConnectBanner}
                                                className="text-muted-foreground/60 hover:text-foreground"
                                            >
                                                <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {overview && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <Card>
                                        <CardContent>
                                            <h3 className="text-[12px] font-semibold text-muted-foreground mb-3">Identity</h3>
                                            <div className="flex items-center justify-between py-1.5 border-t border-border/50">
                                                <span className="text-[12.5px] text-muted-foreground">Endpoint</span>
                                                <button
                                                    onClick={handleCopy}
                                                    className="flex items-center gap-1.5 text-[12px] font-mono text-foreground/80 hover:text-foreground max-w-[220px]"
                                                >
                                                    <span className="truncate">{overview.endpoint}</span>
                                                    <Copy className="w-3 h-3 shrink-0" strokeWidth={1.5} />
                                                </button>
                                            </div>
                                            <div className="flex items-center justify-between py-1.5 border-t border-border/50">
                                                <span className="text-[12.5px] text-muted-foreground">Created</span>
                                                <span className="text-[12.5px] text-foreground/80">
                                                    {overview.createdAt.toLocaleDateString('en-US', {
                                                        month: 'short',
                                                        day: 'numeric',
                                                        year: 'numeric',
                                                    })}
                                                </span>
                                            </div>
                                        </CardContent>
                                    </Card>

                                    <Card>
                                        <CardContent>
                                            <Empty className="border-none p-0">
                                                <EmptyHeader>
                                                    <EmptyMedia variant="icon">
                                                        <BarChart3 className="w-4 h-4" strokeWidth={1.5} />
                                                    </EmptyMedia>
                                                    <EmptyTitle>Track requests, latency, and errors</EmptyTitle>
                                                    <EmptyDescription>
                                                        View tool calls, latency, and errors in Observability.
                                                    </EmptyDescription>
                                                </EmptyHeader>
                                                <EmptyContent>
                                                    <Button variant="outline" size="sm" disabled>
                                                        Open Observability
                                                    </Button>
                                                </EmptyContent>
                                            </Empty>
                                        </CardContent>
                                    </Card>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="py-8" />
                    )}
                </TabsContent>
            ))}
        </Tabs>
    )
}

export default ToolTabs