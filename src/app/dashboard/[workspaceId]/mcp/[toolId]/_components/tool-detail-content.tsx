"use client"

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Unlink, Key, Loader2, XCircle } from 'lucide-react'

import { uninstallTool, disconnectTool, connectApiKey } from '@/actions/install'
import { getToolDetail, ToolDetail } from '@/actions/toll-actions'
import { pollDeploymentStatus } from '@/actions/deploy'
import { deploymentStatusDisplay } from '@/lib/deployment-status'
import { buildToolEndpoint } from '@/lib/tool-endpoint'
import { Button } from '@/components/ui/button'
import ToolHeader, { HeaderVariant, CustomDeploymentStatus } from './tool-header'
import ToolTabs, { TabKey } from './tool-tabs'
import ApiKeyConnectCard from '@/components/global/cards/api-connect-cards'


type Props = {
    workspaceId: string
    toolId: string
    initialTool: ToolDetail
}

const IN_PROGRESS_STATUSES = new Set(['PENDING', 'BUILDING', 'DEPLOYING'])

const INSTALL_STATUS_DISPLAY: Record<string, { label: string; className: string }> = {
    PENDING: { label: 'Pending', className: 'text-amber-500' },
    ACTIVE: { label: 'Running', className: 'text-emerald-500' },
}

const AUTHORIZE_TIMEOUT_MS = 8000

const ToolDetailContent = ({ workspaceId, toolId, initialTool }: Props) => {
    const router = useRouter()
    const queryClient = useQueryClient()
    const [removing, setRemoving] = useState(false)
    const [removeError, setRemoveError] = useState<string | null>(null)
    const [connecting, setConnecting] = useState(false)
    const [bannerDismissed, setBannerDismissed] = useState(false)
    const [apiKeySubmitting, setApiKeySubmitting] = useState(false)
    const [apiKeyError, setApiKeyError] = useState<string | null>(null)
    // FIXED (audit item): a connected API-key tool's "Update key" button
    // used to call handleDisconnect first — silently wiping the working
    // key and resetting status to NOT_CONNECTED the instant it's clicked,
    // before the user has typed anything. This toggle instead just shows
    // the same connect form inline, ON TOP of the still-ACTIVE tool —
    // nothing is touched in the database until they actually submit a
    // new key through it.
    const [showApiKeyUpdate, setShowApiKeyUpdate] = useState(false)

    // Guards against a stale, slow-finishing handleRemove call hijacking
    // whatever page the user has since navigated to. router.push isn't
    // tied to this component's lifecycle — if a Remove click is slow and
    // the user moves on (e.g. to Browse, then re-adds the same tool and
    // lands back on THIS route with a fresh component instance), the old
    // call finishing late would still fire its router.push, yanking the
    // user away from wherever they currently are. This ref lets the
    // handler check "is the instance that started this still the one
    // currently on screen" before navigating.
    const isMountedRef = useRef(true)
    // FIXED (audit item): handleAuthorize's 8s fallback timer was never
    // stored or cleared — if the component unmounted before it fired
    // (e.g. the OAuth redirect actually succeeded and the user navigated
    // away, or they left some other way), it would still fire later and
    // call setConnecting/setRemoveError on a gone component. Storing the
    // id here so the same unmount cleanup below can clear it.
    const authorizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    useEffect(() => {
        isMountedRef.current = true
        return () => {
            isMountedRef.current = false
            if (authorizeTimeoutRef.current) clearTimeout(authorizeTimeoutRef.current)
        }
    }, [])

    const { data: result } = useQuery({
        queryKey: ['tool-detail', workspaceId, toolId],
        queryFn: () => getToolDetail(workspaceId, toolId),
        initialData: { status: 200 as const, data: initialTool },
        // Was relying on initialData alone — but if this exact toolId URL
        // was visited earlier in the same session (e.g. before this tool
        // got removed and re-added), a stale cached result can still be
        // sitting around, either in React Query's own client cache or in
        // Next's client-side route cache feeding stale initialData down.
        // A soft navigation (router.push) back to the same URL then shows
        // that stale data instead of the real current state — only a hard
        // reload bypassed the cache and got the truth. refetchOnMount:
        // 'always' forces a real fetch from getToolDetail every time this
        // component mounts, regardless of how fresh any cached/initial
        // data looks, closing that gap without needing a hard reload.
        refetchOnMount: 'always',
        refetchInterval: (query) => {
            const data = query.state.data?.status === 200 ? query.state.data.data : undefined
            const deploymentStatus = data?.deployment?.status
            const installStatus = data?.install?.status
            if (deploymentStatus && IN_PROGRESS_STATUSES.has(deploymentStatus)) return 3000
            // Deployment just flipped to RUNNING, but the ToolVersion/
            // InstallRecord it triggers (created inside pollDeploymentStatus,
            // a separate call below) may not have landed in the DB yet —
            // keep this query refreshing until that shows up too, instead
            // of stopping the instant status alone looks final and
            // potentially freezing on an incomplete render (no endpoint,
            // no install data) for anyone unlucky enough to land between
            // those two writes.
            if (deploymentStatus === 'RUNNING' && !data?.version) return 3000
            if (installStatus && IN_PROGRESS_STATUSES.has(installStatus)) return 3000
            return false
        },
    })

    const tool = result?.status === 200 && result.data ? result.data : initialTool

    const isCustom = tool.deployment !== null
    const deploymentInProgress = isCustom && tool.deployment && IN_PROGRESS_STATUSES.has(tool.deployment.status)

    // The actual "is it done yet" check for a custom deploy — separate
    // from the read-only query above. getToolDetail only ever reads
    // whatever's already in the database; nothing makes it progress on
    // its own. pollDeploymentStatus is the action that actually calls
    // Railway, updates the Deployment row, and — on the transition into
    // RUNNING — creates the ToolVersion + InstallRecord that make the
    // tool usable at all. Previously this only ever ran from inside the
    // deploy panel's own polling loop while that panel happened to stay
    // open; now that deploying redirects straight to this page instead,
    // THIS is what keeps a deploy actually moving forward. Once it lands
    // on RUNNING/ERROR in the DB, the query above picks up the change on
    // its own next tick and this one goes idle (enabled: false).
    useQuery({
        queryKey: ['deployment-poll', tool.deployment?.id],
        queryFn: () => pollDeploymentStatus(tool.deployment!.id),
        enabled: !!deploymentInProgress,
        refetchInterval: 3000,
    })

    const handleAuthorize = () => {
        setConnecting(true)
        setRemoveError(null)
        // window.location.href triggers a real full-page navigation, so
        // normally this component unmounts before anything else matters.
        // But if the redirect never actually happens for any reason (e.g.
        // the server returns an error response instead of a redirect —
        // see the console/network tab for the real cause), there was
        // previously no way out of this: the button just stayed disabled
        // and showing "Connecting…" forever, with zero feedback. This
        // timeout guarantees the UI recovers either way — now guarded
        // and cleared on unmount (see the ref + effect above) so a late
        // fire after the user's already navigated away doesn't touch a
        // gone component.
        authorizeTimeoutRef.current = setTimeout(() => {
            if (!isMountedRef.current) return
            setConnecting(false)
            setRemoveError('Something went wrong starting the connection — try again.')
        }, AUTHORIZE_TIMEOUT_MS)
        window.location.href = `/api/oauth/authorize?workspaceId=${workspaceId}&toolId=${toolId}`
    }

    const handleRemove = async () => {
        setRemoving(true)
        setRemoveError(null)
        // uninstallTool now takes toolId, not an InstallRecord id — it
        // resolves the right thing to delete (an InstallRecord if this
        // workspace has one, or the Tool row itself if this workspace
        // owns an as-yet-uninstalled custom deploy) internally.
        const res = await uninstallTool(workspaceId, toolId)

        // If this specific component instance has since unmounted (the
        // user navigated away while this was in flight — e.g. went to
        // Browse and re-added the same tool, landing back on a BRAND NEW
        // instance of this same route), don't touch state or navigate.
        // router.push isn't scoped to a component instance, so without
        // this guard a slow-to-finish Remove could still fire and yank
        // the user away from whatever they're looking at now, well after
        // the click that started it is long forgotten.
        if (!isMountedRef.current) return

        setRemoving(false)

        if (res.status === 200) {
            queryClient.invalidateQueries({ queryKey: ['workspace-installs', workspaceId] })
            router.push(`/dashboard/${workspaceId}/mcp`)
            return
        }

        setRemoveError(res.message ?? 'Failed to remove this tool — try again.')
    }

    // "Delete" on a CONNECTED OAuth tool means disconnect, not remove
    // from workspace — the InstallRecord stays, its status just resets
    // to NOT_CONNECTED (server clears any stored tokens too). Reuses the
    // same removing/removeError UI as handleRemove, but doesn't navigate
    // away on success — invalidating the tool-detail query lets this same
    // page re-render itself into the not-connected/Authorize screen.
    const handleDisconnect = async () => {
        setRemoving(true)
        setRemoveError(null)
        const res = await disconnectTool(workspaceId, toolId)

        if (!isMountedRef.current) return

        setRemoving(false)

        if (res.status === 200) {
            queryClient.invalidateQueries({ queryKey: ['tool-detail', workspaceId, toolId] })
            queryClient.invalidateQueries({ queryKey: ['workspace-installs', workspaceId] })
            return
        }

        setRemoveError(res.message ?? 'Failed to disconnect this tool — try again.')
    }

    // Submits a pasted API key (ElevenLabs-style tools) — the non-OAuth
    // counterpart to handleAuthorize. No redirect chain: just send the
    // key, get ACTIVE back, and let the query refetch pick up the change.
    // FIXED (audit item): now has the same isMountedRef guard as
    // handleRemove/handleDisconnect right above it — was missing before,
    // inconsistent with the established pattern in this exact file.
    const handleConnectApiKey = async (apiKey: string) => {
        setApiKeySubmitting(true)
        setApiKeyError(null)
        const res = await connectApiKey(workspaceId, toolId, apiKey)

        if (!isMountedRef.current) return

        setApiKeySubmitting(false)

        if (res.status === 200) {
            setShowApiKeyUpdate(false)
            queryClient.invalidateQueries({ queryKey: ['tool-detail', workspaceId, toolId] })
            queryClient.invalidateQueries({ queryKey: ['workspace-installs', workspaceId] })
            return
        }

        setApiKeyError(res.message ?? 'Failed to connect — try again.')
    }

    let variant: HeaderVariant
    if (isCustom) {
        variant = 'custom'
    } else if (!tool.requiresAuth && !tool.usesApiKey) {
        variant = 'active'
    } else if (!tool.install || tool.install.status === 'NOT_CONNECTED' || tool.install.status === 'FAILED') {
        variant = 'not-connected'
    } else if (tool.install.status === 'PENDING') {
        variant = 'pending'
    } else {
        variant = 'active'
    }

    if (variant === 'not-connected') {
        return (
            <div className="max-w-8xl">
                <ToolHeader
                    name={tool.name}
                    slug={tool.slug}
                    logoUrl={tool.logoUrl}
                    variant="not-connected"
                    statusDisplay={null}
                    endpoint={null}
                    refreshedAt={null}
                    onRemove={handleRemove}
                    removing={removing}
                    onAuthorize={handleAuthorize}
                    connecting={connecting}
                />
                {removeError && <p className="text-[12px] text-red-500 mb-4">{removeError}</p>}

                {tool.usesApiKey ? (
                    <ApiKeyConnectCard
                        hasApiKey={tool.install?.hasApiKey ?? false}
                        onSubmit={handleConnectApiKey}
                        submitting={apiKeySubmitting}
                        error={apiKeyError}
                    />
                ) : (
                    <div className="rounded-xl border border-border/50 bg-card py-16 flex flex-col items-center text-center">
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-4">
                            <Unlink className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
                        </div>
                        <h2 className="text-[15px] font-semibold text-foreground mb-1.5">Connect your account</h2>
                        <p className="text-[13px] text-muted-foreground max-w-sm mb-5">
                            Connect your own account — your credentials stay private to you. Authorize below to connect.
                        </p>
                        <Button onClick={handleAuthorize} disabled={connecting}>
                            {connecting ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <Key className="w-3.5 h-3.5" strokeWidth={1.5} />
                            )}
                            {connecting ? 'Connecting…' : 'Authorize'}
                        </Button>
                    </div>
                )}
            </div>
        )
    }

    const customDeploymentStatus: CustomDeploymentStatus | undefined = isCustom ? tool.deployment!.status : undefined

    const statusDisplay = isCustom
        ? deploymentStatusDisplay[tool.deployment!.status]
        : tool.install
            ? INSTALL_STATUS_DISPLAY[tool.install.status] ?? null
            : null

    // FIXED (audit item): was hand-rolling the exact same fallback
    // buildToolEndpoint already implements — bypassing its warning path
    // and creating a second place this formula could silently drift out
    // of sync with the real one. Now calls the shared helper directly;
    // getToolDetail exposes workspaceSlug specifically to make this
    // possible.
    const endpointResult = buildToolEndpoint(tool.workspaceSlug, tool.slug, tool.deployment?.railwayDomain)
    const endpoint = tool.version?.endpoint ?? (endpointResult.endpoint || null)

    // No "Refreshed" line while a custom deploy is still in progress (it's
    // never actually been refreshed yet, same reasoning as OAuth's
    // PENDING state), or for OAuth's own PENDING state.
    const refreshedAt =
        variant === 'pending' || (isCustom && customDeploymentStatus !== 'RUNNING')
            ? null
            : isCustom
                ? tool.deployment!.updatedAt
                : tool.install?.installedAt ?? null

    // Custom deploy that failed outright — its own dedicated hero screen,
    // parallel to the not-connected one above, rather than trying to show
    // empty tabs and a banner for something that never actually finished.
    if (isCustom && customDeploymentStatus === 'ERROR') {
        return (
            <div className="max-w-8xl">
                <ToolHeader
                    name={tool.name}
                    slug={tool.slug}
                    logoUrl={tool.logoUrl}
                    variant="custom"
                    statusDisplay={statusDisplay}
                    endpoint={null}
                    refreshedAt={null}
                    onRemove={handleRemove}
                    removing={removing}
                    onAuthorize={handleAuthorize}
                    connecting={connecting}
                    deploymentStatus={customDeploymentStatus}
                />
                {removeError && <p className="text-[12px] text-red-500 mb-4">{removeError}</p>}

                <div className="rounded-xl border border-border/50 bg-card py-16 flex flex-col items-center text-center">
                    <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                        <XCircle className="w-5 h-5 text-red-500" strokeWidth={1.5} />
                    </div>
                    <h2 className="text-[15px] font-semibold text-foreground mb-3">Error</h2>
                    {tool.deployment!.errorMessage && (
                        <p className="text-[12.5px] text-red-500 bg-red-500/10 border border-red-500/20 rounded-md px-4 py-2.5 max-w-md">
                            {tool.deployment!.errorMessage}
                        </p>
                    )}
                </div>
            </div>
        )
    }

    const tabs: TabKey[] = tool.usesApiKey ? ['overview', 'variables', 'tools', 'logs'] : ['overview', 'tools', 'logs']

    // "Fully connected" means different things depending on tool type:
    // an OAuth/API-key tool is done once its install status reaches
    // ACTIVE (variant === 'active'); a custom deploy is done once it
    // reaches RUNNING — checking variant === 'active' alone would never
    // match a custom tool, since those are always variant === 'custom'.
    // Was also explicitly excluding isCustom entirely — a real gap this
    // fixes, not just the redundant check.
    const isFullyConnected = isCustom ? customDeploymentStatus === 'RUNNING' : variant === 'active'
    const overviewData =
        isFullyConnected && tool.install
            ? { endpoint: endpoint ?? '', createdAt: tool.install.installedAt }
            : null

    return (
        <div className="max-w-8xl">
            <ToolHeader
                name={tool.name}
                slug={tool.slug}
                logoUrl={tool.logoUrl}
                variant={variant}
                statusDisplay={statusDisplay}
                endpoint={endpoint}
                refreshedAt={refreshedAt}
                onRemove={isCustom ? handleRemove : handleDisconnect}
                removing={removing}
                // FIXED (audit item): was `tool.usesApiKey ? handleDisconnect
                // : handleAuthorize` — clicking "Re-authenticate" on an
                // active API-key tool silently wiped the working key via
                // disconnectTool, no confirmation. Now just reveals the
                // connect form inline (see showApiKeyUpdate below);
                // nothing in the database changes until a new key is
                // actually submitted through handleConnectApiKey.
                onAuthorize={tool.usesApiKey ? () => setShowApiKeyUpdate(true) : handleAuthorize}
                connecting={connecting}
                deploymentStatus={customDeploymentStatus}
                usesApiKey={tool.usesApiKey}
            />
            {removeError && <p className="text-[12px] text-red-500 mb-4">{removeError}</p>}

            {variant === 'pending' && (
                <div className="flex items-center justify-between rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 mb-5">
                    <div className="flex items-center gap-2.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                        <div>
                            <p className="text-[13px] font-semibold text-foreground">Authorize to connect</p>
                            <p className="text-[12px] text-muted-foreground">
                                This server requires authorization before it can be used.
                            </p>
                        </div>
                    </div>
                    <Button size="sm" onClick={handleAuthorize} disabled={connecting}>
                        {connecting ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                            <Key className="w-3.5 h-3.5" strokeWidth={1.5} />
                        )}
                        Authorize
                    </Button>
                </div>
            )}

            {/* Inline "update key" form for an already-connected API-key
                tool — shown ON TOP of the normal active view, not instead
                of it, and doesn't touch the database until submitted. */}
            {variant === 'active' && tool.usesApiKey && showApiKeyUpdate && (
                <div className="mb-5">
                    <ApiKeyConnectCard
                        hasApiKey={tool.install?.hasApiKey ?? false}
                        onSubmit={handleConnectApiKey}
                        submitting={apiKeySubmitting}
                        error={apiKeyError}
                    />
                </div>
            )}

            {isCustom && deploymentInProgress ? (
                <div className="flex items-center gap-2.5 rounded-lg border border-border/50 bg-card px-4 py-3">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" strokeWidth={1.5} />
                    <div>
                        <p className="text-[13px] font-semibold text-foreground">Deploying your server</p>
                        <p className="text-[12px] text-muted-foreground">Updating automatically when ready.</p>
                    </div>
                </div>
            ) : (
                <ToolTabs
                    tabs={tabs}
                    overview={overviewData}
                    showConnectBanner={variant === 'active' && !bannerDismissed}
                    onDismissConnectBanner={() => setBannerDismissed(true)}
                    workspaceId={workspaceId}
                    toolVersionId={tool.version?.id}
                />
            )}
        </div>
    )
}

export default ToolDetailContent