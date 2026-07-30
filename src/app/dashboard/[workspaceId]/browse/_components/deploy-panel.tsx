"use client"

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Loader2, CheckCircle2, XCircle, Package as PackageIcon, Boxes, AlertTriangle, ArrowRight, Plus, Trash2 } from 'lucide-react'
import { GitHubIcon } from '@/components/ui/GithubIcon'
import {
    deployCustomTool,
    pollDeploymentStatus,
    detectToolVariables,
    detectStartCommand,
    detectDefaultBranch,
    resolvePackageRepo,
    checkDeployability,
    DetectedVariable,
} from '@/actions/deploy'
import { deploymentStatusDisplay } from '@/lib/deployment-status'

type Props = {
    workspaceId: string
    open: boolean
    onClose: () => void
}

type Source = 'github' | 'npm' | 'pypi' | 'docker'
type Step = 'form' | 'configure' | 'progress'
type VariableRow = { key: string; value: string; required: boolean; hint?: string }

const POLL_TIMEOUT_MS = 10 * 60 * 1000

const DeployPanel = ({ workspaceId, open, onClose }: Props) => {
    const queryClient = useQueryClient()
    const [step, setStep] = useState<Step>('form')
    const [source, setSource] = useState<Source>('github')
    const [repoVisibility, setRepoVisibility] = useState<'public' | 'private'>('public')
    const [repositoryUrl, setRepositoryUrl] = useState('')
    const [packageName, setPackageName] = useState('')
    const [dockerImage, setDockerImage] = useState('')
    const [serverName, setServerName] = useState('')
    const [branch, setBranch] = useState('')
    const [branchSource, setBranchSource] = useState<string | null>(null)
    const [rootDirectory, setRootDirectory] = useState('')
    const [resolvedRepoUrl, setResolvedRepoUrl] = useState<string | null>(null) // set when npm/pypi resolves to a repo
    const [error, setError] = useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isDetecting, setIsDetecting] = useState(false)
    const [deploymentId, setDeploymentId] = useState<string | null>(null)
    const [variables, setVariables] = useState<VariableRow[]>([])
    const [startCommand, setStartCommand] = useState('')
    const [startCommandSource, setStartCommandSource] = useState<string | null>(null)
    const [pollTimedOut, setPollTimedOut] = useState(false)
    // Non-blocking — the deployability check is a heuristic (a fixed list of
    // marker files), not exhaustive of every language Railpack supports. A
    // false negative shouldn't stop a real deploy, so this only warns.
    const [deployabilityWarning, setDeployabilityWarning] = useState(false)

    const timedOutRef = useRef(false)

    const [mounted, setMounted] = useState(false)
    useEffect(() => setMounted(true), [])

    useEffect(() => {
        timedOutRef.current = false
        setPollTimedOut(false)
        if (step !== 'progress' || !deploymentId) return
        const timer = setTimeout(() => {
            timedOutRef.current = true
            setPollTimedOut(true)
        }, POLL_TIMEOUT_MS)
        return () => clearTimeout(timer)
    }, [step, deploymentId])

    const { data: result } = useQuery({
        queryKey: ['deployment-status', deploymentId],
        queryFn: () => pollDeploymentStatus(deploymentId!),
        enabled: !!deploymentId && step === 'progress',
        refetchInterval: (query) => {
            const status = query.state.data?.status === 200 ? query.state.data.data?.status : undefined
            if (status === 'RUNNING' || status === 'ERROR') return false
            if (timedOutRef.current) return false
            return 3000
        },
    })

    const deployment = result?.status === 200 ? result.data : null
    const unrecognizedRailwayStatus = result?.status === 200 ? result.unrecognizedRailwayStatus : null

    if (!open || !mounted) return null

    // The repo actually being used for detection/deploy: either what the
    // user typed (github source) or what npm/pypi resolved to.
    const effectiveRepoUrl = source === 'github' ? repositoryUrl : resolvedRepoUrl ?? ''

    const repoPreview = (() => {
        const match = effectiveRepoUrl.match(/github\.com\/([^/]+\/[^/]+?)(\.git)?\/?$/)
        return match ? `/${match[1]}` : ''
    })()

    const reset = () => {
        setStep('form')
        setSource('github')
        setRepoVisibility('public')
        setRepositoryUrl('')
        setPackageName('')
        setDockerImage('')
        setServerName('')
        setBranch('')
        setBranchSource(null)
        setRootDirectory('')
        setResolvedRepoUrl(null)
        setError(null)
        setDeploymentId(null)
        setVariables([])
        setStartCommand('')
        setStartCommandSource(null)
        setPollTimedOut(false)
        setDeployabilityWarning(false)
        timedOutRef.current = false
    }

    const handleClose = () => {
        if (deployment?.status === 'RUNNING' || deployment?.status === 'ERROR') {
            queryClient.invalidateQueries({ queryKey: ['workspace-installs', workspaceId] })
        }
        reset()
        onClose()
    }

    const runGithubDetection = async (repoUrl: string) => {
        const resolvedBranch = await detectDefaultBranch(repoUrl)
        const [detectedVars, detectedStart, deployability] = await Promise.all([
            detectToolVariables(repoUrl, resolvedBranch, rootDirectory),
            detectStartCommand(repoUrl, resolvedBranch, rootDirectory),
            checkDeployability(repoUrl, resolvedBranch, rootDirectory),
        ])
        setBranch(resolvedBranch)
        setBranchSource('detected from repository')
        setVariables(
            detectedVars.map((d: DetectedVariable) => ({
                key: d.key,
                value: '',
                required: d.required,
                hint: d.hint,
            }))
        )
        setStartCommand(detectedStart?.command ?? '')
        setStartCommandSource(detectedStart?.source ?? null)
        setDeployabilityWarning(!deployability.looksDeployable)
    }

    const handleContinueToConfigure = async () => {
        setError(null)
        if (!serverName.trim()) return setError('Server name is required')

        if (source === 'docker') {
            if (!dockerImage.trim()) return setError('Docker image is required')
            // Docker images carry their own ENTRYPOINT/CMD — nothing to detect.
            setStartCommand('')
            setStartCommandSource(null)
            setVariables([])
            setDeployabilityWarning(false)
            setStep('configure')
            return
        }

        if (source === 'github') {
            if (repoVisibility === 'private') {
                setError('Private repo deploys need a connected GitHub App — use a public repo for now.')
                return
            }
            if (!repositoryUrl.trim()) return setError('GitHub repository URL is required')

            setIsDetecting(true)
            await runGithubDetection(repositoryUrl.trim())
            setIsDetecting(false)
            setStep('configure')
            return
        }

        // npm / pypi — resolve to a GitHub repo, then reuse the same detection path
        if (!packageName.trim()) return setError('Package name is required')

        setIsDetecting(true)
        const resolved = await resolvePackageRepo(source, packageName.trim())
        if ('error' in resolved) {
            setIsDetecting(false)
            setError(resolved.error)
            return
        }
        setResolvedRepoUrl(resolved.repositoryUrl)
        await runGithubDetection(resolved.repositoryUrl)
        setIsDetecting(false)
        setStep('configure')
    }

    const handleBranchChange = (value: string) => {
        setBranch(value)
        setBranchSource(null)
    }

    // Root directory can also be edited from the configure step (after the
    // first detection pass already ran on the form step's value). Re-run
    // detection on blur so a later edit here isn't silently ignored.
    const handleRootDirectoryBlur = async () => {
        if (source === 'docker' || !effectiveRepoUrl || !branch) return
        setIsDetecting(true)
        const [detectedVars, detectedStart, deployability] = await Promise.all([
            detectToolVariables(effectiveRepoUrl, branch, rootDirectory),
            detectStartCommand(effectiveRepoUrl, branch, rootDirectory),
            checkDeployability(effectiveRepoUrl, branch, rootDirectory),
        ])
        setVariables(
            detectedVars.map((d: DetectedVariable) => ({
                key: d.key,
                value: '',
                required: d.required,
                hint: d.hint,
            }))
        )
        setStartCommand(detectedStart?.command ?? '')
        setStartCommandSource(detectedStart?.source ?? null)
        setDeployabilityWarning(!deployability.looksDeployable)
        setIsDetecting(false)
    }

    const updateVariableValue = (index: number, value: string) => {
        setVariables((prev) => prev.map((v, i) => (i === index ? { ...v, value } : v)))
    }

    const updateVariableKey = (index: number, key: string) => {
        setVariables((prev) =>
            prev.map((v, i) => (i === index ? { ...v, key: key.toUpperCase().replace(/[^A-Z0-9_]/g, '_') } : v))
        )
    }

    const removeVariable = (index: number) => {
        setVariables((prev) => prev.filter((_, i) => i !== index))
    }

    const addBlankVariable = () => {
        setVariables((prev) => [...prev, { key: '', value: '', required: false }])
    }

    const handleDeploy = async () => {
        setError(null)

        const missingRequired = variables.filter((v) => v.required && !v.value.trim())
        if (missingRequired.length > 0) {
            setError(
                `Missing required value${missingRequired.length > 1 ? 's' : ''} for: ${missingRequired
                    .map((v) => v.key)
                    .join(', ')}`
            )
            return
        }

        const cleanVariables = variables
            .filter((v) => v.key.trim() && v.value.trim())
            .map((v) => ({ key: v.key.trim(), value: v.value.trim() }))

        setIsSubmitting(true)
        const res = await deployCustomTool(
            source === 'docker'
                ? {
                    workspaceId,
                    name: serverName.trim(),
                    description: '',
                    source: 'docker',
                    dockerImage: dockerImage.trim(),
                    variables: cleanVariables.length > 0 ? cleanVariables : undefined,
                }
                : {
                    workspaceId,
                    name: serverName.trim(),
                    description: '',
                    source,
                    repositoryUrl: effectiveRepoUrl.trim(),
                    packageName: source !== 'github' ? packageName.trim() : undefined,
                    branch: branch.trim() || 'main',
                    rootDirectory: rootDirectory.trim() || undefined,
                    variables: cleanVariables.length > 0 ? cleanVariables : undefined,
                    startCommand: startCommand.trim() || undefined,
                }
        )
        setIsSubmitting(false)

        if (res.status !== 201 || !res.data) {
            setError(res.message ?? 'Failed to start deployment')
            return
        }

        setDeploymentId(res.data.deploymentId)
        setStep('progress')
    }

    const currentStatus = deployment?.status ?? 'PENDING'
    const isResolved = currentStatus === 'RUNNING' || currentStatus === 'ERROR'

    const sourceTabs: { id: Source; label: string; icon: React.ElementType; enabled: boolean }[] = [
        { id: 'github', label: 'GitHub', icon: GitHubIcon, enabled: true },
        { id: 'npm', label: 'npm', icon: PackageIcon, enabled: true },
        { id: 'pypi', label: 'PyPI', icon: PackageIcon, enabled: true },
        { id: 'docker', label: 'Docker', icon: Boxes, enabled: true },
    ]

    const stepTitle = step === 'form' ? 'Deploy custom MCP' : step === 'configure' ? 'Configure' : serverName

    const panel = (
        <div className="fixed inset-0 z-[60]">
            <div className="absolute inset-0 bg-background/40" onClick={handleClose} />
            <div className="absolute right-0 inset-y-0 w-full max-w-[420px] bg-card border-l border-border/50 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
                <div className="flex items-start justify-between px-5 py-4 border-b border-border/50 shrink-0">
                    <div>
                        <p className="text-[10.5px] font-semibold tracking-wider text-muted-foreground/50 uppercase mb-1">
                            MCP Servers
                        </p>
                        <h2 className="text-[16px] font-medium text-foreground">{stepTitle}</h2>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-1 rounded-md text-muted-foreground/70 hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground transition-colors"
                    >
                        <X className="w-4 h-4" strokeWidth={1.5} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4">
                    {step === 'form' && (
                        <>
                            <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2.5 mb-5">
                                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" strokeWidth={1.5} />
                                <span className="text-amber-500 text-[12px] leading-relaxed">
                                    MCP servers can access your data and execute arbitrary code. Only install
                                    servers from sources you trust.
                                </span>
                            </div>

                            <label className="text-[10.5px] font-semibold tracking-wider text-muted-foreground/50 uppercase mb-2 block">
                                Source
                            </label>
                            <div className="grid grid-cols-4 gap-1.5 mb-4">
                                {sourceTabs.map((tab) => {
                                    const Icon = tab.icon
                                    return (
                                        <button
                                            key={tab.id}
                                            onClick={() => setSource(tab.id)}
                                            className={`h-9 rounded-md text-[12px] font-medium flex items-center justify-center gap-1.5 transition-colors ${source === tab.id
                                                ? 'bg-black/10 dark:bg-white/10 text-foreground border border-border'
                                                : 'text-muted-foreground/60 border border-transparent hover:bg-black/5 dark:hover:bg-white/5'
                                                }`}
                                        >
                                            <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
                                            {tab.label}
                                        </button>
                                    )
                                })}
                            </div>

                            {source === 'github' && (
                                <>
                                    <div className="flex rounded-md bg-black/5 dark:bg-white/5 p-1 mb-4 w-fit">
                                        <button
                                            onClick={() => setRepoVisibility('public')}
                                            className={`h-7 px-3 rounded text-[12px] font-medium transition-colors ${repoVisibility === 'public'
                                                ? 'bg-card shadow-sm text-foreground'
                                                : 'text-muted-foreground'
                                                }`}
                                        >
                                            Public repo
                                        </button>
                                        <button
                                            onClick={() => setRepoVisibility('private')}
                                            className={`h-7 px-3 rounded text-[12px] font-medium transition-colors ${repoVisibility === 'private'
                                                ? 'bg-card shadow-sm text-foreground'
                                                : 'text-muted-foreground'
                                                }`}
                                        >
                                            Private repo
                                        </button>
                                    </div>

                                    <label className="text-[10.5px] font-semibold tracking-wider text-muted-foreground/50 uppercase mb-1.5 block">
                                        GitHub repository
                                    </label>
                                    <input
                                        autoFocus
                                        value={repositoryUrl}
                                        onChange={(e) => setRepositoryUrl(e.target.value)}
                                        placeholder="https://github.com/org/mcp-server"
                                        className="w-full h-9 px-3 rounded-md bg-black/5 dark:bg-white/5 text-[13px] text-foreground placeholder:text-muted-foreground/50 outline-none border border-transparent focus:border-primary"
                                    />
                                    <p className="text-[11.5px] text-muted-foreground mt-1.5 mb-4">
                                        Paste a public GitHub repo URL.
                                    </p>
                                </>
                            )}

                            {(source === 'npm' || source === 'pypi') && (
                                <>
                                    <label className="text-[10.5px] font-semibold tracking-wider text-muted-foreground/50 uppercase mb-1.5 block">
                                        {source === 'npm' ? 'npm package' : 'PyPI package'}
                                    </label>
                                    <input
                                        autoFocus
                                        value={packageName}
                                        onChange={(e) => setPackageName(e.target.value)}
                                        placeholder={source === 'npm' ? '@org/mcp-server' : 'mcp-server'}
                                        className="w-full h-9 px-3 rounded-md bg-black/5 dark:bg-white/5 text-[13px] text-foreground placeholder:text-muted-foreground/50 outline-none border border-transparent focus:border-primary"
                                    />
                                    <p className="text-[11.5px] text-muted-foreground mt-1.5 mb-4">
                                        We'll look up the package's linked GitHub repository and deploy from there.
                                    </p>
                                </>
                            )}

                            {source === 'docker' && (
                                <>
                                    <label className="text-[10.5px] font-semibold tracking-wider text-muted-foreground/50 uppercase mb-1.5 block">
                                        Docker image
                                    </label>
                                    <input
                                        autoFocus
                                        value={dockerImage}
                                        onChange={(e) => setDockerImage(e.target.value)}
                                        placeholder="ghcr.io/org/mcp-server:latest"
                                        className="w-full h-9 px-3 rounded-md bg-black/5 dark:bg-white/5 text-[13px] font-mono text-foreground placeholder:text-muted-foreground/50 outline-none border border-transparent focus:border-primary"
                                    />
                                    <p className="text-[11.5px] text-muted-foreground mt-1.5 mb-4">
                                        Public image from Docker Hub, GHCR, Quay, or GitLab Container Registry.
                                    </p>
                                </>
                            )}

                            {source !== 'docker' && (
                                <>
                                    <label className="text-[10.5px] font-semibold tracking-wider text-muted-foreground/50 uppercase mb-1.5 block">
                                        Root directory{' '}
                                        <span className="normal-case font-normal text-muted-foreground/60">
                                            (optional — if the server lives in a subfolder)
                                        </span>
                                    </label>
                                    <input
                                        value={rootDirectory}
                                        onChange={(e) => setRootDirectory(e.target.value)}
                                        placeholder="e.g. packages/mcp-server"
                                        className="w-full h-9 px-3 rounded-md bg-black/5 dark:bg-white/5 text-[13px] font-mono text-foreground placeholder:text-muted-foreground/50 outline-none border border-transparent focus:border-primary mb-4"
                                    />
                                </>
                            )}

                            <label className="text-[10.5px] font-semibold tracking-wider text-muted-foreground/50 uppercase mb-1.5 block">
                                Server name
                            </label>
                            <input
                                value={serverName}
                                onChange={(e) => setServerName(e.target.value)}
                                placeholder="Weather API"
                                className="w-full h-9 px-3 rounded-md bg-black/5 dark:bg-white/5 text-[13px] text-foreground placeholder:text-muted-foreground/50 outline-none border border-transparent focus:border-primary"
                            />
                            {source === 'github' && repoPreview && (
                                <p className="text-[11.5px] text-muted-foreground/70 mt-1.5 font-mono">{repoPreview}</p>
                            )}

                            {error && <p className="text-[12px] text-red-500 mt-4">{error}</p>}
                        </>
                    )}

                    {step === 'configure' && (
                        <>
                            {deployabilityWarning && (
                                <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2.5 mb-4">
                                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" strokeWidth={1.5} />
                                    <span className="text-amber-500 text-[12px] leading-relaxed">
                                        We couldn't find anything buildable here (no Dockerfile, package.json,
                                        requirements.txt, etc.). This might be a docs-only repo for a server
                                        that's already hosted elsewhere — check the README before deploying. You
                                        can still continue if you're confident this is right.
                                    </span>
                                </div>
                            )}

                            {source !== 'docker' && (
                                <>
                                    {(source === 'npm' || source === 'pypi') && resolvedRepoUrl && (
                                        <p className="text-[11.5px] text-muted-foreground mb-4">
                                            Resolved to <span className="font-mono text-foreground/80">{repoPreview}</span>
                                        </p>
                                    )}

                                    <label className="text-[10.5px] font-semibold tracking-wider text-muted-foreground/50 uppercase mb-1.5 block">
                                        Branch
                                    </label>
                                    <input
                                        value={branch}
                                        onChange={(e) => handleBranchChange(e.target.value)}
                                        placeholder="main"
                                        className="w-full h-9 px-3 rounded-md bg-black/5 dark:bg-white/5 text-[13px] font-mono text-foreground placeholder:text-muted-foreground/50 outline-none border border-transparent focus:border-primary mb-1.5"
                                    />
                                    <p className="text-[10.5px] text-muted-foreground/60 mb-5">
                                        {branchSource ? branchSource : 'edited — using this branch instead of the detected default'}
                                    </p>

                                    <label className="text-[10.5px] font-semibold tracking-wider text-muted-foreground/50 uppercase mb-1.5 block">
                                        Root directory
                                    </label>
                                    <input
                                        value={rootDirectory}
                                        onChange={(e) => setRootDirectory(e.target.value)}
                                        onBlur={handleRootDirectoryBlur}
                                        placeholder="e.g. packages/mcp-server"
                                        className="w-full h-9 px-3 rounded-md bg-black/5 dark:bg-white/5 text-[13px] font-mono text-foreground placeholder:text-muted-foreground/50 outline-none border border-transparent focus:border-primary mb-1.5"
                                    />
                                    <p className="text-[10.5px] text-muted-foreground/60 mb-5">
                                        editing this re-scans for variables and a start command in the new path
                                    </p>

                                    <label className="text-[10.5px] font-semibold tracking-wider text-muted-foreground/50 uppercase mb-1.5 block">
                                        Start command{' '}
                                        <span className="normal-case font-normal text-muted-foreground/60">
                                            (optional — leave blank to auto-detect)
                                        </span>
                                    </label>
                                    <input
                                        value={startCommand}
                                        onChange={(e) => setStartCommand(e.target.value)}
                                        placeholder="e.g. python server.py, uvicorn main:app --host 0.0.0.0 --port $PORT"
                                        className="w-full h-9 px-3 rounded-md bg-black/5 dark:bg-white/5 text-[13px] font-mono text-foreground placeholder:text-muted-foreground/50 outline-none border border-transparent focus:border-primary mb-1.5"
                                    />
                                    {startCommandSource ? (
                                        <p className="text-[10.5px] text-muted-foreground/60 mb-5">
                                            detected from {startCommandSource}
                                        </p>
                                    ) : (
                                        <p className="text-[10.5px] text-amber-500 mb-5">
                                            Nothing detected — if the deploy fails with "no start command," fill this in manually.
                                        </p>
                                    )}
                                </>
                            )}

                            {source === 'docker' && (
                                <p className="text-[12px] text-muted-foreground mb-5">
                                    Docker images run their own built-in entrypoint — no start command needed.
                                </p>
                            )}

                            <label className="text-[10.5px] font-semibold tracking-wider text-muted-foreground/50 uppercase mb-1.5 block">
                                Environment variables
                            </label>
                            <p className="text-[12px] text-muted-foreground mb-3">
                                {variables.length > 0
                                    ? 'We scanned the repo and found these. Fill in values before deploying.'
                                    : "We didn't detect any required environment variables — add any manually if needed."}
                            </p>

                            <div className="flex flex-col gap-3 mb-4">
                                {variables.map((v, i) => (
                                    <div key={i} className="border border-border/50 rounded-lg p-3">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <input
                                                value={v.key}
                                                onChange={(e) => updateVariableKey(i, e.target.value)}
                                                placeholder="VARIABLE_NAME"
                                                className="text-[12.5px] font-mono font-medium text-foreground bg-transparent outline-none flex-1 min-w-0"
                                            />
                                            <div className="flex items-center gap-2 shrink-0">
                                                {v.required && (
                                                    <span className="text-[10px] font-medium text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">
                                                        required
                                                    </span>
                                                )}
                                                <button
                                                    onClick={() => removeVariable(i)}
                                                    className="text-muted-foreground/50 hover:text-red-500 transition-colors"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                                                </button>
                                            </div>
                                        </div>
                                        <input
                                            value={v.value}
                                            onChange={(e) => updateVariableValue(i, e.target.value)}
                                            placeholder="value"
                                            type="password"
                                            className="w-full h-8 px-2.5 rounded bg-black/5 dark:bg-white/5 text-[12.5px] text-foreground placeholder:text-muted-foreground/50 outline-none border border-transparent focus:border-primary"
                                        />
                                        {v.hint && (
                                            <p className="text-[10.5px] text-muted-foreground/60 mt-1">detected from {v.hint}</p>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <button
                                onClick={addBlankVariable}
                                className="flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
                                Add variable
                            </button>

                            {error && <p className="text-[12px] text-red-500 mt-4">{error}</p>}
                        </>
                    )}

                    {step === 'progress' && (
                        <div className="flex flex-col items-center py-6">
                            <div
                                className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${currentStatus === 'ERROR' ? 'bg-red-500/10' : 'bg-black/5 dark:bg-white/5'
                                    }`}
                            >
                                {isResolved ? (
                                    currentStatus === 'RUNNING' ? (
                                        <CheckCircle2 className="w-6 h-6 text-emerald-500" strokeWidth={1.5} />
                                    ) : (
                                        <XCircle className="w-6 h-6 text-red-500" strokeWidth={1.5} />
                                    )
                                ) : (
                                    <Loader2 className="w-6 h-6 animate-spin text-blue-500" strokeWidth={1.5} />
                                )}
                            </div>
                            <p className="text-[13px] font-medium text-foreground">
                                {deploymentStatusDisplay[currentStatus as keyof typeof deploymentStatusDisplay]?.label ?? currentStatus}
                            </p>
                            {currentStatus === 'ERROR' && deployment?.errorMessage && (
                                <p className="text-[12px] text-red-500 mt-3 bg-red-500/5 border border-red-500/20 rounded-md px-3 py-2 text-center">
                                    {deployment.errorMessage}
                                </p>
                            )}
                            {currentStatus === 'RUNNING' && (
                                <p className="text-[12px] text-muted-foreground mt-4 text-center max-w-sm">
                                    Deployed. Connect an MCP client via the "Connect" button on this tool's page —
                                    it'll walk you through logging in, no key to copy.
                                </p>
                            )}
                            {!isResolved && unrecognizedRailwayStatus && (
                                <p className="text-[11.5px] text-muted-foreground mt-2 text-center">
                                    Railway reports: <span className="font-mono">{unrecognizedRailwayStatus}</span> — this
                                    may still be progressing normally even though the label above hasn't updated.
                                </p>
                            )}
                            {!isResolved && pollTimedOut && (
                                <p className="text-[12px] text-amber-500 mt-3 bg-amber-500/5 border border-amber-500/20 rounded-md px-3 py-2 text-center">
                                    Still deploying on Railway — this is taking longer than expected. It may finish
                                    on its own; check back on the MCP Servers list later.
                                </p>
                            )}
                        </div>
                    )}
                </div>

                <div className="px-5 py-4 border-t border-border/50 flex gap-2 shrink-0">
                    <button
                        onClick={step === 'configure' ? () => setStep('form') : handleClose}
                        className="flex-1 h-9 rounded-md border border-border/50 text-[13px] font-medium text-foreground/80 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                    >
                        {step === 'form' ? 'Cancel' : step === 'configure' ? 'Back' : isResolved ? 'Done' : 'Run in background'}
                    </button>

                    {step === 'form' && (
                        <button
                            onClick={handleContinueToConfigure}
                            disabled={isDetecting}
                            className="flex-1 h-9 rounded-md bg-primary text-primary-foreground text-[13px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                        >
                            {isDetecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                            Continue
                            {!isDetecting && <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.5} />}
                        </button>
                    )}

                    {step === 'configure' && (
                        <button
                            onClick={handleDeploy}
                            disabled={isSubmitting}
                            className="flex-1 h-9 rounded-md bg-primary text-primary-foreground text-[13px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                        >
                            {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                            Deploy
                        </button>
                    )}
                </div>
            </div>
        </div>
    )

    return createPortal(panel, document.body)
}

export default DeployPanel