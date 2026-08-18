// src/app/api/mcp-tools/[toolSlug]/mcp/route.ts
//
// The in-app replacement for the standalone server.js — same job, same
// logic, but running INSIDE this Next.js app instead of as a second
// process on a second port. That means: no second ngrok tunnel, no
// port conflicts — this rides on the same tunnel your app already uses.
//
// ToolVersion.internalHost for ElevenLabs should be set to:
//   <your-ngrok-domain>/api/mcp-tools/elevenlabs/mcp
// (the full path, including /mcp — see the note in mcp/route.ts about
// why the path can't be left off.)
//
// To add a new tool: create src/lib/mcp-tools/<name>.ts (copy
// _example.ts), then add it to the TOOLS map below. That's the only
// place a new tool needs registering.

import * as elevenlabs from "@/lib/mcp-tools/elevenlabs"

type ToolModule = {
    slug: string
    listTools: () => unknown[]
    callTool: (toolName: string, args: Record<string, string>, headers: Headers) => Promise<{ content: unknown[] }>
}

const TOOLS: Record<string, ToolModule> = {
    [elevenlabs.slug]: elevenlabs,
}

export async function POST(req: Request, { params }: { params: Promise<{ toolSlug: string }> }) {
    const { toolSlug } = await params
    const tool = TOOLS[toolSlug]

    const body = await req.json().catch(() => null)
    const { id, method, params: rpcParams } = body || {}

    const reply = (result: unknown) => Response.json({ jsonrpc: "2.0", id, result })
    const replyError = (code: number, message: string) =>
        Response.json({ jsonrpc: "2.0", id, error: { code, message } })

    if (!tool) {
        return replyError(-32601, `Unknown tool slug: ${toolSlug}`)
    }

    try {
        if (method === "initialize") {
            return reply({
                protocolVersion: "2025-03-26",
                capabilities: { tools: {} },
                serverInfo: { name: `${tool.slug}-mcp-http`, version: "1.0.0" },
            })
        }

        if (method === "tools/list") {
            return reply({ tools: tool.listTools() })
        }

        if (method === "tools/call") {
            const result = await tool.callTool(rpcParams?.name, rpcParams?.arguments || {}, req.headers)
            return reply(result)
        }

        return replyError(-32601, `Unknown method: ${method}`)
    } catch (err) {
        console.error(`[${tool.slug}]`, err)
        return replyError(-32000, err instanceof Error ? err.message : "Internal error")
    }
}