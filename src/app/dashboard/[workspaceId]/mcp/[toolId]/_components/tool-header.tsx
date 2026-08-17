"use client"

import { useState } from 'react'
import { toast } from 'sonner'
import {
    Package,
    Trash2,
    Key,
    Loader2,
    Plus,
    Activity,
    RefreshCw,
    RotateCw,
    Square,
    Hammer,
    MoreVertical,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export type HeaderVariant = 'not-connected' | 'pending' | 'active' | 'custom'

// Only meaningful when variant === 'custom' — the raw Railway/Deployment
// status, used to decide which action buttons make sense right now.
// Restart/Stop/Rebuild only make sense once something is actually
// running; while still building/deploying, or after a failure, there's
// nothing to restart/stop/rebuild yet.
export type CustomDeploymentStatus = 'PENDING' | 'BUILDING' | 'DEPLOYING' | 'RUNNING' | 'ERROR'

const IN_PROGRESS_DEPLOY_STATUSES = new Set<CustomDeploymentStatus>(['PENDING', 'BUILDING', 'DEPLOYING'])

type Props = {
    name: string
    slug: string
    logoUrl: string | null
    variant: HeaderVariant
    statusDisplay: { label: string; className: string } | null
    endpoint: string | null
    refreshedAt: Date | null
    onRemove: () => void
    removing: boolean
    onAuthorize: () => void
    connecting: boolean
    // Only passed for variant === 'custom' — see CustomDeploymentStatus.
    deploymentStatus?: CustomDeploymentStatus
    // FIXED (audit item): an active API-key tool's "Re-authenticate"-
    // labeled button used to silently call disconnectTool — clearing a
    // working key instantly, with zero confirmation, under a label that
    // implies a safe, non-destructive re-auth (which is exactly what it
    // does for OAuth tools). This flag lets the button say something
    // truthful for API-key tools instead ("Update key"), and the parent
    // now wires onAuthorize to something non-destructive for that case
    // (see tool-detail-content.tsx) rather than an immediate disconnect.
    usesApiKey?: boolean
}

const notAvailableYet = () => toast('Coming soon — not wired up yet.')

const ToolHeader = ({
    name,
    slug,
    logoUrl,
    variant,
    statusDisplay,
    endpoint,
    refreshedAt,
    onRemove,
    removing,
    onAuthorize,
    connecting,
    deploymentStatus,
    usesApiKey,
}: Props) => {
    const [menuOpen, setMenuOpen] = useState(false)

    const icon = (
        <div className="w-8 h-8 rounded-md bg-black/10 dark:bg-white/10 flex items-center justify-center overflow-hidden shrink-0">
            {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt={name} className="w-full h-full object-cover" />
            ) : (
                <Package className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
            )}
        </div>
    )

    if (variant === 'not-connected') {
        return (
            <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-2.5">
                    {icon}
                    <div>
                        <h1 className="text-[16px] font-semibold text-foreground">{name}</h1>
                        <p className="text-[12px] font-mono text-muted-foreground/70">{slug}</p>
                    </div>
                </div>
                <Button variant="outline" size="sm" onClick={onRemove} disabled={removing}>
                    {removing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />}
                    Remove
                </Button>
            </div>
        )
    }

    const dateLabel = refreshedAt
        ? refreshedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : null

    const customInProgress = variant === 'custom' && !!deploymentStatus && IN_PROGRESS_DEPLOY_STATUSES.has(deploymentStatus)
    const customErrored = variant === 'custom' && deploymentStatus === 'ERROR'
    const customRunning = variant === 'custom' && deploymentStatus === 'RUNNING'

    return (
        <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-2.5 min-w-0">
                {icon}
                <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                        <h1 className="text-[16px] font-semibold text-foreground">{name}</h1>
                        {statusDisplay && (
                            <span className={`flex items-center gap-1 text-[12px] font-medium ${statusDisplay.className}`}>
                                {customInProgress ? (
                                    <Loader2 className="w-2.5 h-2.5 animate-spin" strokeWidth={2} />
                                ) : (
                                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                                )}
                                {statusDisplay.label}
                            </span>
                        )}
                    </div>
                    {endpoint && (
                        <p className="text-[12px] font-mono text-amber-500/80 break-all">{endpoint}</p>
                    )}
                    {dateLabel && (
                        <p className="text-[11px] text-muted-foreground/60">Refreshed {dateLabel}</p>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-5 shrink-0">
                {/* Errored custom deploys skip "+ Connect" too — nothing
                    running to connect to yet. */}
                {!customErrored && (
                    <Button variant="outline" size="sm" onClick={notAvailableYet}>
                        <Plus className="w-3.5 h-3.5" strokeWidth={2} />
                        Connect
                    </Button>
                )}

                {variant === 'pending' && (
                    <Button size="sm" onClick={onAuthorize} disabled={connecting}>
                        {connecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" strokeWidth={1.5} />}
                        {connecting ? 'Connecting…' : 'Authorize'}
                    </Button>
                )}

                {variant === 'active' && (
                    <>
                        <Button variant="outline" size="sm" onClick={notAvailableYet}>
                            <Activity className="w-3.5 h-3.5" strokeWidth={1.5} />
                            Test
                        </Button>
                        <Button variant="outline" size="sm" onClick={notAvailableYet}>
                            <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
                            Refresh
                        </Button>
                        <Button variant="outline" size="sm" onClick={onAuthorize} disabled={connecting}>
                            {connecting ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <Key className="w-3.5 h-3.5" strokeWidth={1.5} />
                            )}
                            {usesApiKey ? 'Update key' : connecting ? 'Connecting…' : 'Re-authenticate'}
                        </Button>
                    </>
                )}

                {/* Restart/Stop/Rebuild only make sense once the service is
                    actually RUNNING. While still building/deploying, or
                    after an error, there's nothing to restart/stop/rebuild —
                    only "Connect" (if not errored) + the kebab menu show. */}
                {customRunning && (
                    <>
                        <Button variant="outline" size="sm" onClick={notAvailableYet}>
                            <RotateCw className="w-3.5 h-3.5" strokeWidth={1.5} />
                            Restart
                        </Button>
                        <Button variant="outline" size="sm" onClick={notAvailableYet}>
                            <Square className="w-3.5 h-3.5" strokeWidth={1.5} />
                            Stop
                        </Button>
                        <Button variant="outline" size="sm" onClick={notAvailableYet}>
                            <Hammer className="w-3.5 h-3.5" strokeWidth={1.5} />
                            Rebuild
                        </Button>
                    </>
                )}

                <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                    <DropdownMenuTrigger render={<Button variant="outline" size="icon-sm" />}>
                        <MoreVertical className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem variant="destructive" onClick={onRemove} disabled={removing}>
                            {removing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />}
                            Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    )
}

export default ToolHeader