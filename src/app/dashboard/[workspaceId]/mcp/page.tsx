import React from 'react'

import { getWorkspaceInstalls } from '@/actions/install'

import McpServersTable from './_components/mcp-server-table'
import McpServersHeader from './_components/mcp-server-header'
import McpServersEmptyState from './_components/mcp-server-hero'

type Props = {
    params: Promise<{ workspaceId: string }>
}

const McpServersPage = async ({ params }: Props) => {
    const { workspaceId } = await params
    const result = await getWorkspaceInstalls(workspaceId)

    if (result.status !== 200 || !result.data) {
        return (
            <div className="p-6 md:p-8">
                <p className="text-[13px] text-muted-foreground">
                    {result.message ?? 'Unable to load MCP servers.'}
                </p>
            </div>
        )
    }

    // Zero installs at all -> the full animated empty state, per the
    // reference screenshot. Zero SEARCH results (with installs existing)
    // stays a small inline message inside the table itself, unchanged.
    if (result.data.installs.length === 0) {
        return (
            <div className="p-6 md:p-8">
                <McpServersHeader workspaceId={workspaceId} />
                <McpServersEmptyState workspaceId={workspaceId} />
            </div>
        )
    }

    return (
        <div className="p-6 md:p-8">
            <McpServersHeader workspaceId={workspaceId} />
            <McpServersTable workspaceId={workspaceId} initialInstalls={result.data.installs} />
        </div>
    )
}

export default McpServersPage