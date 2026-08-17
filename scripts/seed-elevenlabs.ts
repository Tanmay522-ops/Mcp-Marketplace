// scripts/update-elevenlabs-endpoint.ts
//
// Fixes the endpoint on an already-existing ElevenLabs ToolVersion row —
// computed via the same shared formula real custom deploys use, instead
// of the hardcoded placeholder the original seed script used before it
// was updated. Run once:
//
//   npx tsx scripts/update-elevenlabs-endpoint.ts

process.loadEnvFile()

import { PrismaClient } from "@prisma/client"
import { buildToolEndpoint } from "../src/lib/tool-endpoint"

const client = new PrismaClient()

async function main() {
    const tool = await client.tool.findUnique({
        where: { slug: "elevenlabs" },
        include: { workspace: { select: { slug: true } } },
    })
    if (!tool) {
        throw new Error('No tool with slug "elevenlabs" found — run seed-elevenlabs.ts first.')
    }

    const version = await client.toolVersion.findFirst({
        where: { toolId: tool.id },
        orderBy: { createdAt: "desc" },
    })
    if (!version) {
        throw new Error("ElevenLabs tool has no version to update.")
    }

    const result = buildToolEndpoint(tool.workspace.slug, tool.slug)
    if (!result.usedGatewayBase) {
        console.warn(result.warning)
        throw new Error("NEXT_PUBLIC_GATEWAY_BASE_URL is not set in .env — can't compute a real endpoint.")
    }

    await client.toolVersion.update({
        where: { id: version.id },
        data: { endpoint: result.endpoint },
    })

    console.log(`Updated ElevenLabs endpoint to: ${result.endpoint}`)
}

main()
    .catch((error) => {
        console.error(error)
        process.exitCode = 1
    })
    .finally(async () => {
        await client.$disconnect()
    })