// One-off script — updates the stored `endpoint` on a ToolVersion row.
//
// Why this is needed: tool-detail-content.tsx does
//   const endpoint = tool.version?.endpoint ?? (endpointResult.endpoint || null)
// so if ToolVersion.endpoint already has ANY value (true for any tool
// that was seeded directly, like ElevenLabs), that stored value always
// wins — buildToolEndpoint()'s freshly-computed URL (from
// NEXT_PUBLIC_GATEWAY_BASE_URL) never gets used. Changing the env var
// alone does nothing for a tool in this state; the stored row has to be
// updated directly, every time your public URL changes (e.g. a new
// ngrok session).
//
// Run with: npx tsx scripts/update-tool-endpoint.ts

import { PrismaClient } from "@prisma/client"

const client = new PrismaClient()

// --- edit these two before running ---
const TOOL_SLUG_CONTAINS = "elevenlabs"
const NEW_GATEWAY_BASE_URL = "https://unpluralistic-unabasing-inocencia.ngrok-free.dev"
// --------------------------------------

async function main() {
    const tool = await client.tool.findFirst({
        where: { slug: { contains: TOOL_SLUG_CONTAINS, mode: "insensitive" } },
        select: {
            id: true,
            name: true,
            slug: true,
            workspace: { select: { slug: true } },
        },
    })

    if (!tool) {
        console.error(`No tool found matching slug "${TOOL_SLUG_CONTAINS}".`)
        process.exit(1)
    }

    const version = await client.toolVersion.findFirst({
        where: { toolId: tool.id },
        orderBy: { createdAt: "desc" },
        select: { id: true, version: true, endpoint: true },
    })

    if (!version) {
        console.error(`Tool "${tool.name}" has no ToolVersion rows.`)
        process.exit(1)
    }

    const newEndpoint = `${NEW_GATEWAY_BASE_URL}/${tool.workspace.slug}/${tool.slug}/mcp`

    console.log(`Tool: ${tool.name} (${tool.workspace.slug}/${tool.slug})`)
    console.log(`Old endpoint: ${version.endpoint}`)
    console.log(`New endpoint: ${newEndpoint}`)

    await client.toolVersion.update({
        where: { id: version.id },
        data: { endpoint: newEndpoint },
    })

    console.log("✓ Updated.")
}

main()
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
    .finally(() => client.$disconnect())