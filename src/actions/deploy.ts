"use server"

import { client } from "@/lib/prisma"
import { getCallerContext } from "@/hooks/useCallerContext"
import {
    railwayRequest,
    assertRailwayConfigured,
    RAILWAY_ME_QUERY,
    RAILWAY_PROJECT_CREATE,
    RAILWAY_SERVICE_CREATE,
    RAILWAY_SERVICE_DOMAIN_CREATE,
    RAILWAY_DEPLOYMENT_STATUS_QUERY,
    RAILWAY_VARIABLE_UPSERT,
    RAILWAY_SERVICE_INSTANCE_UPDATE,
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

export type DetectedVariable = { key: string; required: boolean; hint?: string }

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
                    if (match) found.set(match[1], { key: match[1], required: true, hint: filename })
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
                if (match && !found.has(match[1])) {
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
const toPrismaSourceType = (source: DeploySource): "GITHUB" | "NPM" | "PYPI" | "DOCKER" => source.toUpperCase() as any

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
            await client.deployment.update({
                where: { id: deployment.id },
                data: {
                    status: "ERROR",
                    errorMessage: railwayError instanceof Error ? railwayError.message : "Unknown Railway error",
                },
            })
            return { status: 201 as const, data: { toolId: tool.id, deploymentId: deployment.id } }
        }
    } catch (error) {
        console.error("deployCustomTool error:", error)
        return { status: 500 as const, message: "Internal error starting deployment" }
    }
}

export const pollDeploymentStatus = async (deploymentId: string) => {
    try {
        const deployment = await client.deployment.findUnique({ where: { id: deploymentId } })
        if (!deployment) {
            return { status: 404 as const, message: "Deployment not found" }
        }
        if (!deployment.railwayServiceId || !deployment.railwayProjectId) {
            return { status: 200 as const, data: deployment }
        }
        if (deployment.status === "RUNNING" || deployment.status === "ERROR") {
            return { status: 200 as const, data: deployment }
        }

        const result = await railwayRequest<{
            deployments: { edges: { node: { status: string } }[] }
        }>(RAILWAY_DEPLOYMENT_STATUS_QUERY, {
            projectId: deployment.railwayProjectId,
            environmentId: deployment.railwayEnvironmentId,
            serviceId: deployment.railwayServiceId,
        })

        const railwayStatus = result.deployments.edges[0]?.node.status

        const statusMap: Record<string, "PENDING" | "BUILDING" | "DEPLOYING" | "RUNNING" | "ERROR"> = {
            QUEUED: "PENDING",
            BUILDING: "BUILDING",
            DEPLOYING: "DEPLOYING",
            SUCCESS: "RUNNING",
            FAILED: "ERROR",
            CRASHED: "ERROR",
        }

        const mappedStatus = railwayStatus ? statusMap[railwayStatus] ?? deployment.status : deployment.status

        const updated = await client.deployment.update({
            where: { id: deploymentId },
            data: { status: mappedStatus },
        })

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

                return { status: 200 as const, data: updated }
            }
        }

        return { status: 200 as const, data: updated }
    } catch (error) {
        console.error("pollDeploymentStatus error:", error)
        return { status: 500 as const, message: "Internal error checking deployment status" }
    }
}