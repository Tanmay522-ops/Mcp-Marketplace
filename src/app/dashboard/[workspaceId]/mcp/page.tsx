import { getWorkspaceInstalls } from '@/actions/install'
import McpServersTable from './_components/mcp-server-table'


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

    return (
        <div className="p-6 md:p-8">
            <McpServersTable workspaceId={workspaceId} initialInstalls={result.data.installs} />
        </div>
    )
}

export default McpServersPage