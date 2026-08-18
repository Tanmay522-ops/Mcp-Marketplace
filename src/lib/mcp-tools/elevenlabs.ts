// src/lib/mcp-tools/elevenlabs.ts
//
// Same logic as the standalone tools/elevenlabs.js from before — moved
// inside the Next.js app so it runs on the SAME port (3000) as
// everything else, meaning the SAME ngrok tunnel you already have
// working covers this too. No second tunnel, no second process.

type ToolResult = { content: Array<{ type: string; data?: string; text?: string; mimeType?: string }> }

async function elevenLabsGenerateSpeech({
    apiKey,
    text,
    voiceId,
    modelId,
}: {
    apiKey: string
    text: string
    voiceId: string
    modelId?: string
}): Promise<string> {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            text,
            model_id: modelId || "eleven_flash_v2",
        }),
    })

    if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText)
        throw new Error(`ElevenLabs API error (${res.status}): ${errText}`)
    }

    const arrayBuffer = await res.arrayBuffer()
    return Buffer.from(arrayBuffer).toString("base64")
}

async function elevenLabsListVoices(apiKey: string) {
    const res = await fetch("https://api.elevenlabs.io/v1/voices", {
        headers: { "xi-api-key": apiKey },
    })
    if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText)
        throw new Error(`ElevenLabs API error (${res.status}): ${errText}`)
    }
    const data = await res.json()
    return (data.voices || []).map((v: { voice_id: string; name: string }) => ({ voice_id: v.voice_id, name: v.name }))
}

export const slug = "elevenlabs"

export const listTools = () => [
    {
        name: "generate_speech",
        description: "Convert text to speech using ElevenLabs and return the audio.",
        inputSchema: {
            type: "object",
            properties: {
                text: { type: "string", description: "The text to convert to speech." },
                voice_id: { type: "string", description: "Voice ID to use. Defaults to the workspace's saved default voice if not given." },
                model_id: { type: "string", description: "ElevenLabs model to use (default: eleven_flash_v2)." },
            },
            required: ["text"],
        },
    },
    {
        name: "list_voices",
        description: "List available ElevenLabs voices and their IDs.",
        inputSchema: { type: "object", properties: {} },
    },
]

// `headers` is the incoming Next.js request's Headers object — the same
// headers mcp/route.ts already attaches (Authorization + X-Default-Voice-Id
// etc.), just read via .get() instead of a plain object like the
// standalone version used.
export const callTool = async (toolName: string, args: Record<string, string>, headers: Headers): Promise<ToolResult> => {
    const auth = headers.get("authorization")
    const apiKey = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : auth
    if (!apiKey) {
        throw new Error("Missing API key — no Authorization header was forwarded.")
    }

    if (toolName === "generate_speech") {
        const voiceId = args.voice_id || headers.get("x-default-voice-id") || undefined
        if (!voiceId) {
            throw new Error("No voice_id given and no default voice ID saved for this workspace.")
        }
        const audioBase64 = await elevenLabsGenerateSpeech({
            apiKey,
            text: args.text,
            voiceId,
            modelId: args.model_id,
        })
        return { content: [{ type: "audio", data: audioBase64, mimeType: "audio/mpeg" }] }
    }

    if (toolName === "list_voices") {
        const voices = await elevenLabsListVoices(apiKey)
        return { content: [{ type: "text", text: JSON.stringify(voices, null, 2) }] }
    }

    throw new Error(`Unknown tool: ${toolName}`)
}