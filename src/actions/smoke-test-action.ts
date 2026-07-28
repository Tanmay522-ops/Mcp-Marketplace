"use server"

import Ajv from "ajv"
import { client } from "@/lib/prisma"
import { getCallerContext } from "@/hooks/useCallerContext"

const ajv = new Ajv({ allErrors: true, strict: false })
const TIMEOUT_MS = 15000

// Reads one JSON-RPC message from a response, whichever format the
// server chose to answer with:
// - Content-Type: application/json -> just parse the body directly
// - Content-Type: text/event-stream -> read the stream manually and
//   grab the FIRST "data: {...}" event, then stop reading — this is
//   the actual fix for the earlier hang. The naive approach
//   (`res.text()`) waits for the entire stream to close, which some
//   servers never do on purpose (they keep it open for future
//   server-initiated messages). A smoke test only needs the one
//   response to this one request, not a live subscription.
async function readMcpResponse(res: Response): Promise<any | null> {
    const contentType = res.headers.get("content-type") ?? ""

    if (contentType.includes("application/json")) {
        try {
            return await res.json()
        } catch {
            return null
        }
    }

    if (contentType.includes("text/event-stream") && res.body) {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        try {
            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })

                // SSE messages are separated by a blank line; each "data:"
                // line inside one holds the actual JSON payload.
                const lines = buffer.split("\n")
                for (const line of lines) {
                    if (line.startsWith("data:")) {
                        const raw = line.slice(5).trim()
                        try {
                            const parsed = JSON.parse(raw)
                            await reader.cancel() // stop listening — got what we needed
                            return parsed
                        } catch {
                            // Not a complete JSON payload yet, keep reading.
                        }
                    }
                }
            }
        } catch {
            return null
        }

        return null
    }

    // Fallback: try plain text -> JSON, in case Content-Type was missing
    // or unexpected.
    try {
        const text = await res.text()
        return JSON.parse(text)
    } catch {
        return null
    }
}

// Minimal real MCP JSON-RPC client — enough to run a smoke test against
// an actual Streamable HTTP MCP server. Two calls: `initialize` (the
// required handshake — captures the session id via the
// `mcp-session-id` response header) then `tools/call` using that
// session.
//
// NOTE: this is a pragmatic subset of the spec, not a full client —
// no `notifications/initialized` follow-up, no auth headers. Good
// enough for a smoke test; swap for a real MCP client SDK later if
// needed.
async function callMcpTool(
    endpoint: string,
    toolName: string,
    args: unknown,
    signal: AbortSignal
): Promise<{ ok: true; output: unknown } | { ok: false; error: string }> {
    // The official MCP SDK's server transport strictly validates that
    // BOTH of these are present and returns 406 if either is missing —
    // confirmed by hitting that exact error with only "application/json"
    // sent. So both stay here; the actual fix for the earlier hang is in
    // readMcpResponse below, which stops listening after the first
    // message instead of waiting for the whole stream to end.
    const jsonRpcHeaders = {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
    }

    // Step 1: initialize handshake.
    const initRes = await fetch(endpoint, {
        method: "POST",
        headers: jsonRpcHeaders,
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
                protocolVersion: "2025-03-26",
                capabilities: {},
                clientInfo: { name: "smoke-test-runner", version: "1.0.0" },
            },
        }),
        signal,
    })

    if (!initRes.ok) {
        return { ok: false, error: `Server returned status ${initRes.status} during MCP initialize.` }
    }

    const sessionId = initRes.headers.get("mcp-session-id")
    const initJson = await readMcpResponse(initRes)
    if (!initJson) {
        return { ok: false, error: "Server's initialize response wasn't readable." }
    }
    if (initJson.error) {
        return { ok: false, error: `MCP initialize failed: ${initJson.error.message}` }
    }

    // Step 2: confirm the tool actually exists on the server first. Some
    // servers (e.g. the official reference implementation) never reply to
    // tools/call for an unrecognized name — they just leave the request
    // hanging — which otherwise surfaces as a confusing "no response
    // within N seconds" instead of the real problem (a name typo/mismatch).
    const callHeaders: Record<string, string> = { ...jsonRpcHeaders }
    if (sessionId) callHeaders["mcp-session-id"] = sessionId

    const listRes = await fetch(endpoint, {
        method: "POST",
        headers: callHeaders,
        body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
        signal,
    })
    if (listRes.ok) {
        const listJson = await readMcpResponse(listRes)
        const availableTools: string[] | undefined = listJson?.result?.tools?.map((t: { name: string }) => t.name)
        if (availableTools && !availableTools.includes(toolName)) {
            return {
                ok: false,
                error: `Tool "${toolName}" wasn't found on the server. Available tools: ${availableTools.join(", ") || "(none)"}.`,
            }
        }
    }

    // Step 3: the actual tool call.
    const callRes = await fetch(endpoint, {
        method: "POST",
        headers: callHeaders,
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: 3,
            method: "tools/call",
            params: { name: toolName, arguments: args },
        }),
        signal,
    })

    if (!callRes.ok) {
        return { ok: false, error: `Server returned status ${callRes.status} on tools/call.` }
    }

    const callJson = await readMcpResponse(callRes)
    if (!callJson) {
        return { ok: false, error: "Response to tools/call wasn't readable." }
    }

    if (callJson.error) {
        return { ok: false, error: `MCP error: ${callJson.error.message}` }
    }

    const result = callJson.result
    if (!result) {
        return { ok: false, error: "Response had no `result` field." }
    }
    if (result.isError) {
        const text = result.content?.[0]?.text ?? "Tool reported an error."
        return { ok: false, error: text }
    }

    // Real MCP tool results come back as a `content` array of blocks
    // (usually { type: "text", text: "..." }). Publishers often JSON
    // -encode their actual structured output inside that text block —
    // try to parse it as JSON so it can be checked against outputSchema;
    // fall back to the raw content array if it's plain text.
    const firstBlock = result.content?.[0]
    if (firstBlock?.type === "text") {
        try {
            return { ok: true, output: JSON.parse(firstBlock.text) }
        } catch {
            return { ok: true, output: firstBlock.text }
        }
    }

    return { ok: true, output: result.content ?? result }
}

export const runSmokeTest = async (workspaceId: string, toolCapabilityId: string) => {
    try {
        const ctx = await getCallerContext(workspaceId)
        if (ctx.error) return ctx.error

        if (ctx.callerRole !== "OWNER" && ctx.callerRole !== "ADMIN") {
            return { status: 403 as const, message: "You don't have permission to run tests for this tool" }
        }

        const capability = await client.toolCapability.findUnique({
            where: { id: toolCapabilityId },
            include: { toolVersion: { select: { endpoint: true, toolId: true } } },
        })
        if (!capability) {
            return { status: 404 as const, message: "Tool capability not found" }
        }

        // SECURITY NOTE: calls the endpoint directly from the server —
        // acceptable only because just the deploying workspace's own
        // OWNER/ADMIN can trigger this against their own tool. Before this
        // runs against untrusted marketplace tools from OTHER workspaces,
        // move the actual fetch inside an isolated sandbox (E2B).
        const execution = await client.toolExecution.create({
            data: {
                toolCapabilityId,
                triggeredById: ctx.userId,
                workspaceId,
                type: "SMOKE_TEST",
                status: "RUNNING",
                input: capability.exampleInput as object,
            },
        })

        const startedAt = Date.now()
        let mcpResult: Awaited<ReturnType<typeof callMcpTool>>

        try {
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
            mcpResult = await callMcpTool(
                capability.toolVersion.endpoint,
                capability.name,
                capability.exampleInput,
                controller.signal
            )
            clearTimeout(timeout)
        } catch (fetchError) {
            mcpResult =
                fetchError instanceof Error && fetchError.name === "AbortError"
                    ? { ok: false, error: `No response within ${TIMEOUT_MS / 1000} seconds.` }
                    : { ok: false, error: "Couldn't reach your server — check it's running and the endpoint URL is correct." }
        }

        const durationMs = Date.now() - startedAt

        if (!mcpResult.ok) {
            await client.toolExecution.update({
                where: { id: execution.id },
                data: { status: "FAILED", error: mcpResult.error, durationMs, finishedAt: new Date() },
            })
            return { status: 200 as const, data: { passed: false, error: mcpResult.error, durationMs } }
        }

        const validate = ajv.compile(capability.outputSchema as object)
        const isValid = validate(mcpResult.output)

        if (!isValid) {
            const firstError = validate.errors?.[0]
            const errorMsg = firstError
                ? `Response doesn't match your declared schema — ${firstError.instancePath || "response"} ${firstError.message}.`
                : "Response doesn't match your declared output schema."

            await client.toolExecution.update({
                where: { id: execution.id },
                data: {
                    status: "FAILED",
                    error: errorMsg,
                    output: mcpResult.output as object,
                    durationMs,
                    finishedAt: new Date(),
                },
            })
            return { status: 200 as const, data: { passed: false, error: errorMsg, durationMs } }
        }

        await client.toolExecution.update({
            where: { id: execution.id },
            data: { status: "PASSED", output: mcpResult.output as object, durationMs, finishedAt: new Date() },
        })

        await client.toolAnalytics
            .upsert({
                where: { toolId: capability.toolVersion.toolId },
                create: { toolId: capability.toolVersion.toolId, totalExecutions: 1, successCount: 1, totalDurationMs: BigInt(durationMs) },
                update: {
                    totalExecutions: { increment: 1 },
                    successCount: { increment: 1 },
                    totalDurationMs: { increment: BigInt(durationMs) },
                },
            })
            .catch((err) => console.error("runSmokeTest: analytics update failed:", err))

        return { status: 200 as const, data: { passed: true, durationMs } }
    } catch (error) {
        console.error("runSmokeTest error:", error)
        return { status: 500 as const, message: "Internal error running smoke test" }
    }
}