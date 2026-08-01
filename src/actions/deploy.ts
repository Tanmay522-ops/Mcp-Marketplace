"use server"

import { client } from "@/lib/prisma"
import { getCallerContext } from "@/hooks/useCallerContext"
import {
    railwayRequest,
    assertRailwayConfigured,
    RAILWAY_ME_QUERY,
    RAILWAY_PROJECT_CREATE,
    RAILWAY_PROJECT_DELETE,
    RAILWAY_SERVICE_CREATE,
    RAILWAY_SERVICE_DOMAIN_CREATE,
    RAILWAY_DEPLOYMENT_STATUS_QUERY,
    RAILWAY_VARIABLE_UPSERT,
    RAILWAY_SERVICE_INSTANCE_UPDATE,
    RAILWAY_SERVICE_INSTANCE_LIMITS_UPDATE,
    RAILWAY_SERVICE_DEPLOY,
} from "@/lib/railway-client"

type DeploySource = "github" | "npm" | "pypi" | "docker"

type DeployCustomToolInput = {
    workspaceId: string
    name: string
    description: string
    source: DeploySource
    // github source, or npm/pypi ALREADY resolved to a repo client-side:
    repositoryUrl?: string
    branch?: string
    rootDirectory?: string
    // npm/pypi: the original package name, kept for display/audit even
    // though repositoryUrl is what's actually deployed
    packageName?: string
    // docker source:
    dockerImage?: string
    variables?: { key: string; value: string }[]
    startCommand?: string
}

const parseGitHubUrl = (repositoryUrl: string): { owner: string; repo: string } | null => {
    const match = repositoryUrl.match(/github\.com\/([^/]+)\/([^/]+?)(\.git)?\/?$/)
    if (!match) return null
    const [, owner, repo] = match
    return { owner, repo }
}

// Joins an optional subdirectory onto a raw.githubusercontent.com path so
// detection can look inside a monorepo package instead of only the repo
// root. "" / "." / "/" all mean "root".
const joinRepoPath = (rootDirectory: string | undefined, filename: string): string => {
    const cleaned = (rootDirectory ?? "").trim().replace(/^\/+|\/+$/g, "")
    return cleaned && cleaned !== "." ? `${cleaned}/${filename}` : filename
}

export const detectDefaultBranch = async (repositoryUrl: string): Promise<string> => {
    const parsed = parseGitHubUrl(repositoryUrl)
    if (!parsed) return "main"
    const { owner, repo } = parsed

    try {
        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
            headers: { Accept: "application/vnd.github+json" },
        })
        if (res.ok) {
            const json = await res.json()
            if (typeof json?.default_branch === "string" && json.default_branch) {
                return json.default_branch
            }
        }
    } catch {
        /* fall through to probing */
    }

    for (const branch of ["main", "master"]) {
        try {
            const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches/${branch}`)
            if (res.ok) return branch
        } catch {
            /* try next */
        }
    }

    return "main"
}

export type ResolvedPackageRepo = { repositoryUrl: string } | { error: string }

const normalizeToGithubUrl = (url?: string | null): string | null => {
    if (!url) return null
    const match = url.match(/github\.com[:/]([^/]+)\/([^/.]+)/)
    if (!match) return null
    return `https://github.com/${match[1]}/${match[2]}`
}

export const resolvePackageRepo = async (
    source: "npm" | "pypi",
    packageName: string
): Promise<ResolvedPackageRepo> => {
    const trimmed = packageName.trim()
    if (!trimmed) return { error: "Package name is required" }

    if (source === "npm") {
        try {
            const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(trimmed)}`)
            if (!res.ok) return { error: `Package "${trimmed}" not found on npm` }
            const json = await res.json()
            const githubUrl = normalizeToGithubUrl(json?.repository?.url)
            if (!githubUrl) {
                return {
                    error: `"${trimmed}" doesn't list a GitHub repository on npm — deploy it via GitHub directly instead`,
                }
            }
            return { repositoryUrl: githubUrl }
        } catch {
            return { error: "Failed to look up package on npm" }
        }
    }

    try {
        const res = await fetch(`https://pypi.org/pypi/${encodeURIComponent(trimmed)}/json`)
        if (!res.ok) return { error: `Package "${trimmed}" not found on PyPI` }
        const json = await res.json()
        const projectUrls: Record<string, string> = json?.info?.project_urls ?? {}
        const candidates = [json?.info?.home_page, ...Object.values(projectUrls)]
        const githubUrl = candidates.map(normalizeToGithubUrl).find((u): u is string => !!u)
        if (!githubUrl) {
            return {
                error: `"${trimmed}" doesn't list a GitHub repository on PyPI — deploy it via GitHub directly instead`,
            }
        }
        return { repositoryUrl: githubUrl }
    } catch {
        return { error: "Failed to look up package on PyPI" }
    }
}

export type DetectedStartCommand = { command: string; source: string } | null

export const detectStartCommand = async (
    repositoryUrl: string,
    branch: string,
    rootDirectory?: string
): Promise<DetectedStartCommand> => {
    const parsed = parseGitHubUrl(repositoryUrl)
    if (!parsed) return null
    const { owner, repo } = parsed
    const base = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`

    try {
        const dockerRes = await fetch(`${base}/${joinRepoPath(rootDirectory, "Dockerfile")}`)
        if (dockerRes.ok) {
            return { command: "", source: "Dockerfile (auto-used, no command needed)" }
        }
    } catch { /* ignore */ }

    try {
        const procRes = await fetch(`${base}/${joinRepoPath(rootDirectory, "Procfile")}`)
        if (procRes.ok) {
            const text = await procRes.text()
            const webLine = text.split("\n").find((l) => l.trim().startsWith("web:"))
            if (webLine) {
                return { command: webLine.replace(/^web:\s*/, "").trim(), source: "Procfile" }
            }
        }
    } catch { /* ignore */ }

    try {
        const railwayJsonRes = await fetch(`${base}/${joinRepoPath(rootDirectory, "railway.json")}`)
        if (railwayJsonRes.ok) {
            const json = await railwayJsonRes.json()
            const cmd = json?.deploy?.startCommand
            if (cmd) return { command: cmd, source: "railway.json" }
        }
    } catch { /* ignore */ }

    try {
        const pkgRes = await fetch(`${base}/${joinRepoPath(rootDirectory, "package.json")}`)
        if (pkgRes.ok) {
            const pkg = await pkgRes.json()
            if (pkg?.scripts?.start) {
                return { command: "npm start", source: "package.json (scripts.start)" }
            }
        }
    } catch { /* ignore */ }

    return null
}

export type DeployabilityCheck = {
    looksDeployable: boolean
    // Which marker file was found, if any — shown to the user as reassurance
    // when present, or omitted when nothing was found.
    foundMarker: string | null
}

// Checks for ANY file that would tell Railpack (or a Dockerfile build) there's
// something to actually build here. This is NOT exhaustive of every possible
// language/framework Railpack supports — it's deliberately a "does this look
// like source code at all" sanity check, not a strict allowlist. A repo that
// only contains docs/license/README (e.g. one that just points at an
// already-hosted remote server, like Taplio's) has none of these, and a
// deploy attempt against it fails on Railway's side ~30+ seconds later with
// no clearer explanation than "railpack process exited with an error." This
// catches that case up front, before the user commits to a deploy attempt.
const DEPLOYABILITY_MARKERS = [
    "Dockerfile",
    "package.json",
    "requirements.txt",
    "pyproject.toml",
    "go.mod",
    "Gemfile",
    "Cargo.toml",
    "composer.json",
]

export const checkDeployability = async (
    repositoryUrl: string,
    branch: string,
    rootDirectory?: string
): Promise<DeployabilityCheck> => {
    const parsed = parseGitHubUrl(repositoryUrl)
    if (!parsed) return { looksDeployable: true, foundMarker: null } // can't check — don't block on an unrelated failure

    const { owner, repo } = parsed
    const base = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`

    for (const marker of DEPLOYABILITY_MARKERS) {
        try {
            const res = await fetch(`${base}/${joinRepoPath(rootDirectory, marker)}`)
            if (res.ok) return { looksDeployable: true, foundMarker: marker }
        } catch {
            // A network hiccup here shouldn't block the whole flow — treat
            // as inconclusive and keep checking the rest of the list.
        }
    }

    return { looksDeployable: false, foundMarker: null }
}

export type DetectedVariable = { key: string; required: boolean; hint?: string }

// Variables Railway (or the deploy platform generally) injects
// automatically at runtime — never surface these as something the user
// needs to fill in. PORT specifically was silently causing a real bug:
// detectToolVariables would find it in .env.example, mark it "required",
// and the Deploy button would then block submission on an empty value the
// user was never supposed to provide themselves — or worse, if they typed
// something in, it could conflict with the port Railway's networking
// layer actually expects the container to listen on.
const PLATFORM_MANAGED_VARS = new Set(["PORT"])

export const detectToolVariables = async (
    repositoryUrl: string,
    branch: string,
    rootDirectory?: string
): Promise<DetectedVariable[]> => {
    const parsed = parseGitHubUrl(repositoryUrl)
    if (!parsed) return []
    const { owner, repo } = parsed
    const base = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`

    const found = new Map<string, DetectedVariable>()

    for (const filename of [".env.example", ".env.sample"]) {
        try {
            const res = await fetch(`${base}/${joinRepoPath(rootDirectory, filename)}`)
            if (res.ok) {
                const text = await res.text()
                for (const line of text.split("\n")) {
                    const match = line.match(/^([A-Z_][A-Z0-9_]*)\s*=/)
                    if (match && !PLATFORM_MANAGED_VARS.has(match[1])) {
                        found.set(match[1], { key: match[1], required: true, hint: filename })
                    }
                }
            }
        } catch { /* ignore, try next file */ }
        if (found.size > 0) break
    }

    try {
        const res = await fetch(`${base}/${joinRepoPath(rootDirectory, "Dockerfile")}`)
        if (res.ok) {
            const text = await res.text()
            for (const line of text.split("\n")) {
                const match = line.match(/^ENV\s+([A-Z_][A-Z0-9_]*)/)
                if (match && !found.has(match[1]) && !PLATFORM_MANAGED_VARS.has(match[1])) {
                    found.set(match[1], { key: match[1], required: false, hint: "Dockerfile" })
                }
            }
        }
    } catch { /* ignore */ }

    return Array.from(found.values())
}

// Maps our client-facing "source" (which includes npm/pypi) to the
// Prisma ToolSourceType stored on Tool/Deployment, and to what Railway
// actually needs (which only knows github vs. image).
//
// Was `source.toUpperCase() as any` — bypassed verifying the uppercased
// string actually matches the Prisma enum. An explicit Record instead
// means TypeScript itself now errors if DeploySource ever gains a new
// value without a matching entry here, instead of compiling cleanly and
// only failing later at the DB write (or silently storing a bad value).
const SOURCE_TYPE_MAP: Record<DeploySource, "GITHUB" | "NPM" | "PYPI" | "DOCKER"> = {
    github: "GITHUB",
    npm: "NPM",
    pypi: "PYPI",
    docker: "DOCKER",
}
const toPrismaSourceType = (source: DeploySource): "GITHUB" | "NPM" | "PYPI" | "DOCKER" => SOURCE_TYPE_MAP[source]

export const deployCustomTool = async ({
    workspaceId,
    name,
    description,
    source,
    repositoryUrl,
    branch = "main",
    rootDirectory,
    packageName,
    dockerImage,
    variables,
    startCommand,
}: DeployCustomToolInput) => {
    try {
        const ctx = await getCallerContext(workspaceId)
        if (ctx.error) return ctx.error

        if (ctx.callerRole !== "OWNER" && ctx.callerRole !== "ADMIN") {
            return { status: 403 as const, message: "You don't have permission to deploy tools in this workspace" }
        }

        // Cooldown: reject if this workspace deployed anything in the last
        // DEPLOY_COOLDOWN_SECONDS. This is the direct fix for rapid-fire
        // bursts of Railway project creation — whatever caused a given
        // burst (repeated test retries, a debugging loop, or genuinely
        // fast real usage), this stops it at the source instead of hoping
        // it doesn't happen. Tune the window via env if it's too strict —
        // start conservative, loosen once you've confirmed real usage
        // patterns don't need faster back-to-back deploys.
        const cooldownSeconds = Number(process.env.DEPLOY_COOLDOWN_SECONDS ?? "15")
        const recentDeployment = await client.deployment.findFirst({
            where: { tool: { workspaceId } },
            orderBy: { createdAt: "desc" },
            select: { createdAt: true },
        })
        if (recentDeployment) {
            const secondsSinceLast = (Date.now() - recentDeployment.createdAt.getTime()) / 1000
            if (secondsSinceLast < cooldownSeconds) {
                return {
                    status: 429 as const,
                    message: `Please wait ${Math.ceil(cooldownSeconds - secondsSinceLast)} more second(s) before deploying again.`,
                }
            }
        }

        const trimmedName = name.trim()
        if (!trimmedName) return { status: 400 as const, message: "Name is required" }

        const isGitBacked = source === "github" || source === "npm" || source === "pypi"

        let repoShorthand: string | null = null
        let trimmedBranch = ""
        let trimmedRootDirectory = ""
        let resolvedRepositoryUrl: string | null = null // always a real git URL when isGitBacked, else null
        let sourceRef: string | null = null // what the user actually typed: repo URL, package name, or image ref

        if (isGitBacked) {
            const trimmedRepoUrl = (repositoryUrl ?? "").trim()
            if (!trimmedRepoUrl) return { status: 400 as const, message: "Repository URL is required" }
            const repoMatch = trimmedRepoUrl.match(/github\.com\/([^/]+\/[^/]+?)(\.git)?\/?$/)
            if (!repoMatch) return { status: 400 as const, message: "Enter a valid GitHub repository URL" }
            repoShorthand = repoMatch[1]
            trimmedBranch = branch.trim() || "main"
            trimmedRootDirectory = (rootDirectory ?? "").trim()
            resolvedRepositoryUrl = trimmedRepoUrl
            sourceRef = source === "github" ? trimmedRepoUrl : (packageName ?? "").trim() || trimmedRepoUrl
        } else {
            const trimmedImage = (dockerImage ?? "").trim()
            if (!trimmedImage) return { status: 400 as const, message: "Docker image is required" }
            sourceRef = trimmedImage
        }

        const slug = `${trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Math.random().toString(36).slice(2, 8)}`
        const prismaSourceType = toPrismaSourceType(source)

        const tool = await client.tool.create({
            data: {
                workspaceId,
                name: trimmedName,
                slug,
                description: description.trim() || "Custom deployed MCP server.",
                sourceType: prismaSourceType,
                sourceRef,
                repositoryUrl: resolvedRepositoryUrl, // null for docker — no more overloading
                visibility: "PRIVATE",
                deployments: {
                    create: {
                        sourceType: prismaSourceType,
                        sourceRef,
                        repositoryUrl: resolvedRepositoryUrl,
                        branch: trimmedBranch || null,
                        status: "PENDING",
                        requestedById: ctx.userId,
                    },
                },
            },
            include: { deployments: true },
        })

        const deployment = tool.deployments[0]

        // Tracks the Railway project once created, so the catch block below
        // can delete it on failure instead of leaving it orphaned — this is
        // the actual fix for projects piling up from failed/retried deploys.
        let createdRailwayProjectId: string | null = null

        try {
            assertRailwayConfigured()

            let railwayWorkspaceId = process.env.RAILWAY_WORKSPACE_ID
            if (!railwayWorkspaceId) {
                const { me } = await railwayRequest<{ me: { workspaces: { id: string; name: string }[] } }>(
                    RAILWAY_ME_QUERY,
                    {}
                )
                railwayWorkspaceId = me.workspaces[0]?.id
                if (!railwayWorkspaceId) {
                    throw new Error(
                        "No Railway workspace found — set RAILWAY_WORKSPACE_ID in .env (Railway dashboard: Cmd/Ctrl+K -> Copy Workspace ID)"
                    )
                }
            }

            const { projectCreate } = await railwayRequest<{
                projectCreate: { id: string; environments: { edges: { node: { id: string; name: string } }[] } }
            }>(RAILWAY_PROJECT_CREATE, { input: { name: `mcp-${slug}`, workspaceId: railwayWorkspaceId } })
            createdRailwayProjectId = projectCreate.id

            const environmentId = projectCreate.environments.edges[0]?.node.id
            if (!environmentId) {
                throw new Error("Railway project created but has no default environment")
            }

            await client.deployment.update({
                where: { id: deployment.id },
                data: {
                    status: "BUILDING",
                    railwayProjectId: projectCreate.id,
                    railwayEnvironmentId: environmentId,
                },
            })

            // Railway only ever sees "github repo" or "docker image" —
            // npm/pypi were already resolved to a repo URL before we got
            // here, so they ride the same branch as github.
            const { serviceCreate } = await railwayRequest<{ serviceCreate: { id: string } }>(
                RAILWAY_SERVICE_CREATE,
                {
                    input: isGitBacked
                        ? {
                            projectId: projectCreate.id,
                            name: trimmedName,
                            source: { repo: repoShorthand },
                            branch: trimmedBranch,
                        }
                        : {
                            projectId: projectCreate.id,
                            name: trimmedName,
                            source: { image: sourceRef },
                        },
                }
            )

            // Cap every deployed service unconditionally, regardless of
            // startCommand/variables — without this, a service defaults to
            // scaling up to your PLAN's full ceiling, meaning one heavy
            // deployed tool can consume the entire account's resource pool
            // and crash/starve every other tool sharing it (this is the
            // "Free plan resource provision limit exceeded" failure mode).
            // Tune via env vars to match your actual plan's real capacity —
            // defaults here are deliberately small (fits comfortably within
            // a typical free-tier pool split across a few services).
            const defaultVCPUs = Number(process.env.RAILWAY_DEFAULT_VCPU_LIMIT ?? "0.5")
            const defaultMemoryGB = Number(process.env.RAILWAY_DEFAULT_MEMORY_GB_LIMIT ?? "0.5")

            await railwayRequest<{ serviceInstanceLimitsUpdate: boolean }>(RAILWAY_SERVICE_INSTANCE_LIMITS_UPDATE, {
                input: {
                    serviceId: serviceCreate.id,
                    environmentId,
                    vCPUs: defaultVCPUs,
                    memoryGB: defaultMemoryGB,
                },
            })
            // NOTE: assuming this applies as a live runtime ceiling (Railway's
            // own docs describe it as "scale up to the limits you've set"),
            // not baked-in build config — so it's NOT added to the
            // redeploy-trigger condition below. If you find resource limits
            // only actually take effect after a redeploy, add this to that
            // condition too.

            const instanceUpdateInput: Record<string, string> = {}
            if (startCommand && startCommand.trim()) instanceUpdateInput.startCommand = startCommand.trim()
            if (trimmedRootDirectory) instanceUpdateInput.rootDirectory = trimmedRootDirectory

            if (Object.keys(instanceUpdateInput).length > 0) {
                await railwayRequest<{ serviceInstanceUpdate: boolean }>(RAILWAY_SERVICE_INSTANCE_UPDATE, {
                    serviceId: serviceCreate.id,
                    environmentId,
                    input: instanceUpdateInput,
                })
            }

            if (variables && variables.length > 0) {
                await Promise.all(
                    variables.map((v) =>
                        railwayRequest<{ variableUpsert: boolean }>(RAILWAY_VARIABLE_UPSERT, {
                            input: {
                                projectId: projectCreate.id,
                                environmentId,
                                serviceId: serviceCreate.id,
                                name: v.key,
                                value: v.value,
                            },
                        })
                    )
                )
            }

            if (Object.keys(instanceUpdateInput).length > 0 || (variables && variables.length > 0)) {
                await railwayRequest<{ serviceInstanceDeployV2: string }>(RAILWAY_SERVICE_DEPLOY, {
                    environmentId,
                    serviceId: serviceCreate.id,
                })
            }

            await client.deployment.update({
                where: { id: deployment.id },
                data: { status: "DEPLOYING", railwayServiceId: serviceCreate.id },
            })

            const { serviceDomainCreate } = await railwayRequest<{
                serviceDomainCreate: { domain: string }
            }>(RAILWAY_SERVICE_DOMAIN_CREATE, {
                input: { serviceId: serviceCreate.id, environmentId },
            })

            await client.deployment.update({
                where: { id: deployment.id },
                data: { railwayDomain: serviceDomainCreate.domain },
            })

            return { status: 201 as const, data: { toolId: tool.id, deploymentId: deployment.id } }
        } catch (railwayError) {
            console.error("deployCustomTool: Railway API call failed:", railwayError)

            if (createdRailwayProjectId) {
                try {
                    await railwayRequest<{ projectDelete: boolean }>(RAILWAY_PROJECT_DELETE, {
                        id: createdRailwayProjectId,
                    })
                } catch (cleanupError) {
                    // Don't let a failed cleanup attempt mask the original
                    // error, or crash the whole request — log it and move
                    // on. Worst case, this one project needs manual
                    // deletion, which is still far better than every failed
                    // deploy leaving one behind silently.
                    console.error(
                        "deployCustomTool: failed to clean up orphaned Railway project",
                        createdRailwayProjectId,
                        cleanupError
                    )
                }
            }

            await client.deployment.update({
                where: { id: deployment.id },
                data: {
                    status: "ERROR",
                    errorMessage: railwayError instanceof Error ? railwayError.message : "Unknown Railway error",
                },
            })
            // Intentionally still 201, not an error status: a real Deployment
            // row now exists (with status ERROR), which is what deploy-panel.tsx
            // actually needs — it only checks status/data here to decide
            // whether to move to the progress screen with a real deploymentId.
            // The next poll immediately sees status "ERROR" already set (no
            // extra Railway call, pollDeploymentStatus short-circuits on
            // RUNNING/ERROR) and the panel renders the failure from there.
            // Confirmed this is the deliberate design, not an inconsistency —
            // don't "fix" this to a failure status without also changing how
            // the panel decides when to show the progress screen.
            return { status: 201 as const, data: { toolId: tool.id, deploymentId: deployment.id } }
        }
    } catch (error) {
        console.error("deployCustomTool error:", error)
        return { status: 500 as const, message: "Internal error starting deployment" }
    }
}

export const pollDeploymentStatus = async (deploymentId: string) => {
    try {
        const deployment = await client.deployment.findUnique({
            where: { id: deploymentId },
            include: { tool: { select: { workspaceId: true } } },
        })
        if (!deployment) {
            return { status: 404 as const, message: "Deployment not found" }
        }

        // Unlike every other exported action in this file, this one took
        // a bare deploymentId with no membership check at all — any
        // authenticated user who knew or guessed an id could read another
        // workspace's deployment status/error message, and indirectly
        // trigger writes (the update below) and Railway project deletion
        // through this same function on an ERROR transition.
        const ctx = await getCallerContext(deployment.tool.workspaceId)
        if (ctx.error) return ctx.error

        if (!deployment.railwayServiceId || !deployment.railwayProjectId) {
            return { status: 200 as const, data: deployment, unrecognizedRailwayStatus: null }
        }
        if (deployment.status === "RUNNING" || deployment.status === "ERROR") {
            return { status: 200 as const, data: deployment, unrecognizedRailwayStatus: null }
        }

        const result = await railwayRequest<{
            deployments: { edges: { node: { status: string } }[] }
        }>(RAILWAY_DEPLOYMENT_STATUS_QUERY, {
            projectId: deployment.railwayProjectId,
            environmentId: deployment.railwayEnvironmentId,
            serviceId: deployment.railwayServiceId,
        })

        const railwayStatus = result.deployments.edges[0]?.node.status

        if (!railwayStatus) {
            // Railway returned zero deployment records for this
            // project/environment/service combo. Usually just a brief
            // window right after triggering (Railway hasn't registered its
            // own internal deployment yet) that self-resolves on the next
            // poll — but if this repeats for the SAME deploymentId across
            // many polls, that's the account-level "stuck" symptom, now at
            // least visible in logs instead of silent.
            console.warn(
                "pollDeploymentStatus: Railway returned no deployment record yet for deploymentId",
                deploymentId,
                "— will retry on next poll."
            )
        }

        // Verified directly against Railway's GraphQL schema introspection
        // (DeploymentStatus enum) — not docs prose, not guesswork. This is
        // now the complete, real list; every one of these 13 values is
        // confirmed to exist. (ACTIVE and COMPLETED, guessed earlier from
        // the docs' prose, do NOT actually exist in the real enum — removed.)
        const statusMap: Record<string, "PENDING" | "BUILDING" | "DEPLOYING" | "RUNNING" | "ERROR"> = {
            // Not yet building — waiting somewhere in the pipeline
            QUEUED: "PENDING",
            INITIALIZING: "PENDING",
            WAITING: "PENDING", // waiting for CI (Wait for CI) to pass
            NEEDS_APPROVAL: "PENDING", // paused pending manual approval — can sit here until a human acts on Railway's side; not something our code can resolve

            // Actively in progress
            BUILDING: "BUILDING",
            DEPLOYING: "DEPLOYING",

            // Genuinely working
            SUCCESS: "RUNNING",
            SLEEPING: "RUNNING", // scale-to-zero/idle (Serverless) — functioning normally, just idle; wakes on next request, not a failure

            // Not usable, for us, one way or another
            FAILED: "ERROR",
            CRASHED: "ERROR",
            SKIPPED: "ERROR", // build was skipped — shouldn't normally occur on a fresh first deploy in our flow; if it does, nothing actually built, so no usable server exists
            REMOVING: "ERROR", // being torn down while we were still polling
            REMOVED: "ERROR", // gone
        }

        // Set below whenever Railway reports something outside statusMap —
        // this is what lets the UI show Railway's literal, real word
        // instead of freezing on a stale label when a status arrives that
        // nobody's taught our code about yet.
        let unrecognizedRailwayStatus: string | null = null

        if (railwayStatus && !(railwayStatus in statusMap)) {
            // Railway returned a status string we don't recognize. Falling
            // back to "keep the existing status" below is the SAFE choice
            // (never crash, never wrongly mark something ERROR/RUNNING) —
            // but it looks identical to "stuck" from the UI's perspective.
            // This log is what makes that distinguishable after the fact:
            // if you see this for a deploy that seemed to hang, the real
            // cause is an unmapped Railway status, not account throttling —
            // add that status string to statusMap above once you know
            // what it should map to.
            unrecognizedRailwayStatus = railwayStatus
            console.warn(
                "pollDeploymentStatus: unrecognized Railway status",
                railwayStatus,
                "for deploymentId",
                deploymentId,
                "— falling back to existing status",
                deployment.status
            )
        }

        const mappedStatus = railwayStatus ? statusMap[railwayStatus] ?? deployment.status : deployment.status

        const updated = await client.deployment.update({
            where: { id: deploymentId },
            data: {
                status: mappedStatus,
                // Previously only `status` was set here — a build failure
                // caught via polling (as opposed to a failure during the
                // initial synchronous setup calls in deployCustomTool) left
                // errorMessage blank, so the panel showed a bare "Error"
                // with no explanation at all. This gives the user something
                // actionable instead of a dead end.
                ...(mappedStatus === "ERROR" && !deployment.errorMessage
                    ? {
                        errorMessage:
                            "The build failed on Railway. This usually means nothing buildable was found (no Dockerfile, package.json, requirements.txt, etc.) or the build itself errored — check the repository structure, or view the build logs in your Railway dashboard for the exact reason.",
                    }
                    : {}),
            },
        })

        // The OTHER failure path: this deployment's initial Railway API
        // calls all succeeded (project/service created fine), but the
        // actual BUILD failed afterward — e.g. Railpack couldn't find
        // anything to build from. That failure only surfaces here, via
        // polling, not in deployCustomTool's try/catch (which only covers
        // failures during the synchronous setup calls). Clean up the
        // orphaned project here too, or every build failure leaves one
        // behind exactly like the synchronous-failure case used to.
        // Guarded by the OLD status check so this only fires once, on the
        // actual transition into ERROR — same pattern as the RUNNING
        // handling below.
        if (mappedStatus === "ERROR" && updated.railwayProjectId) {
            try {
                await railwayRequest<{ projectDelete: boolean }>(RAILWAY_PROJECT_DELETE, {
                    id: updated.railwayProjectId,
                })
            } catch (cleanupError) {
                console.error(
                    "pollDeploymentStatus: failed to clean up orphaned Railway project after build failure",
                    updated.railwayProjectId,
                    cleanupError
                )
            }
        }

        if (mappedStatus === "RUNNING" && updated.railwayDomain) {
            const existingVersion = await client.toolVersion.findFirst({
                where: { toolId: updated.toolId },
            })

            if (!existingVersion) {
                const tool = await client.tool.findUnique({
                    where: { id: updated.toolId },
                    select: { workspaceId: true, slug: true, workspace: { select: { slug: true } } },
                })

                const gatewayBase = process.env.NEXT_PUBLIC_GATEWAY_BASE_URL
                if (!gatewayBase) {
                    console.warn(
                        "pollDeploymentStatus: NEXT_PUBLIC_GATEWAY_BASE_URL is not set — falling back to the raw Railway domain, which the gateway proxy will NOT route through workspace/tool slugs."
                    )
                }
                const publicEndpoint =
                    tool && gatewayBase
                        ? `${gatewayBase}/${tool.workspace.slug}/${tool.slug}/mcp`
                        : `https://${updated.railwayDomain}`

                const newVersion = await client.toolVersion.create({
                    data: {
                        toolId: updated.toolId,
                        version: "1.0.0",
                        endpoint: publicEndpoint,
                        internalHost: updated.railwayDomain,
                        status: "PUBLISHED",
                        createdById: updated.requestedById,
                        capabilities: {
                            create: {
                                name: "default",
                                description: "Auto-created on deploy — edit this to match your server's real tool.",
                                inputSchema: { type: "object", properties: {} },
                                outputSchema: { type: "object", properties: {} },
                                exampleInput: {},
                                exampleOutput: {},
                            },
                        },
                    },
                })

                if (tool) {
                    await client.installRecord.create({
                        data: {
                            workspaceId: tool.workspaceId,
                            toolVersionId: newVersion.id,
                            installedById: updated.requestedById,
                            method: "MANUAL",
                            status: "ACTIVE",
                        },
                    })
                }

                return { status: 200 as const, data: updated, unrecognizedRailwayStatus }
            }
        }

        return { status: 200 as const, data: updated, unrecognizedRailwayStatus }
    } catch (error) {
        console.error("pollDeploymentStatus error:", error)
        return { status: 500 as const, message: "Internal error checking deployment status" }
    }
}