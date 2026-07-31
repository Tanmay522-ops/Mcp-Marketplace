import type { DeploymentStatus } from "@prisma/client"

export const deploymentStatusDisplay: Record<DeploymentStatus, { label: string; className: string }> = {
    PENDING: { label: "Pending", className: "text-amber-500" },
    BUILDING: { label: "Building", className: "text-amber-500" },
    DEPLOYING: { label: "Deploying", className: "text-blue-500" },
    RUNNING: { label: "Running", className: "text-emerald-500" },
    ERROR: { label: "Error", className: "text-red-500" },
}

// There's no STOPPED value in the Prisma DeploymentStatus enum (only
// PENDING/BUILDING/DEPLOYING/RUNNING/ERROR) — adding one means a migration.
// Until that happens, a user-initiated stop is recorded as ERROR with this
// exact errorMessage, and callers that need to distinguish "stopped on
// purpose" from "actually broke" check for this marker instead.
export const STOPPED_MARKER = "Stopped by user"
