import { searchMarketplaceTools } from '@/actions/install'
import BrowseContent from './_components/browse-content'
import Link from 'next/link'

type Props = {
    params: Promise<{ workspaceId: string }>
}

export const maxDuration = 300

const BrowsePage = async ({ params }: Props) => {
    const { workspaceId } = await params
    const result = await searchMarketplaceTools(workspaceId)

    const tools = result.status === 200 ? result.data?.tools ?? [] : []

    return (
        <div className="p-6 md:p-8">
            <div className="flex items-center gap-2 mb-6 text-[13px]">
                <Link href={`/dashboard/${workspaceId}/mcp`} className="text-muted-foreground hover:text-foreground transition-colors">
                    MCP Servers
                </Link>
                <span className="text-muted-foreground/50">/</span>
                <span className="text-foreground font-medium">Browse</span>
            </div>

            <BrowseContent workspaceId={workspaceId} initialTools={tools} />
        </div>
    )
}

export default BrowsePage