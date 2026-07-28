import type { DeploymentStatus } from "@prisma/client"

export const deploymentStatusDisplay: Record<DeploymentStatus, { label: string; className: string }> = {
    PENDING: { label: "Pending", className: "text-amber-500" },
    BUILDING: { label: "Building", className: "text-amber-500" },
    DEPLOYING: { label: "Deploying", className: "text-blue-500" },
    RUNNING: { label: "Running", className: "text-emerald-500" },
    ERROR: { label: "Error", className: "text-red-500" },
}
