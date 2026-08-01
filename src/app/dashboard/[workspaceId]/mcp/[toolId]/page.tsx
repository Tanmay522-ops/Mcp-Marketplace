

import { getToolDetail } from "@/actions/toll-actions";
import ToolDetailContent from "./_components/tool-detail-content"

type Props = {
    params: Promise<{ workspaceId: string; toolId: string }>
}

const ToolDetailPage = async ({ params }: Props) => {
    const { workspaceId, toolId } = await params
    const result = await getToolDetail(workspaceId, toolId)

    if (result.status !== 200 || !result.data) {
        return (
            <div className="p-6 md:p-8">
                <p className="text-[13px] text-muted-foreground">
                    {result.message ?? "Unable to load this tool."}
                </p>
            </div>
        )
    }

    return (
        <div className="p-6 md:p-8">
            <ToolDetailContent workspaceId={workspaceId} toolId={toolId} initialTool={result.data} />
        </div>
    )
}

export default ToolDetailPage