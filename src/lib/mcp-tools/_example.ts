// src/lib/mcp-tools/_example.ts
//
// TEMPLATE — copy this file to add a new tool. Rename it, set `slug` to
// match that tool's slug in your marketplace database and the path
// segment you'll use in ToolVersion.internalHost. Then register it in
// the `TOOLS` map inside src/app/api/mcp-tools/[toolSlug]/mcp/route.ts.

export const slug = "example-tool"

export const listTools = () => [
    {
        name: "do_something",
        description: "Describe what this tool call actually does.",
        inputSchema: {
            type: "object",
            properties: {
                input: { type: "string", description: "Describe this parameter." },
            },
            required: ["input"],
        },
    },
]

export const callTool = async (toolName: string, args: Record<string, string>, headers: Headers) => {
    const apiKey = headers.get("authorization")?.replace(/^Bearer\s+/, "")

    if (toolName === "do_something") {
        return { content: [{ type: "text", text: `Received: ${args.input}` }] }
    }

    throw new Error(`Unknown tool: ${toolName}`)
}