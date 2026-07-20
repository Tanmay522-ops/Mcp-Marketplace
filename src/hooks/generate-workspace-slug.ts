 export const generateWorkspaceSlug = (name: string, userId: string) => {
    const base = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
    const suffix = userId.slice(0, 6) + Math.random().toString(36).slice(2, 6)
    return `${base}-${suffix}`
}