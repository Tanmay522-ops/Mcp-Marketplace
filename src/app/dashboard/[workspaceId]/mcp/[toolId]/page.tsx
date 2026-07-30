
import { Package } from 'lucide-react'
import { getToolDetails } from '@/actions/tool-version-action';
import PublishButton from './_components/publish-button'
import ConnectButton from './_components/connect-button'
import { deploymentStatusDisplay } from '@/lib/deployment-status'


type Props = {
  params: Promise<{ workspaceId: string; toolId: string }>
}

const ToolDetailPage = async ({ params }: Props) => {
  const { workspaceId, toolId } = await params
  const result = await getToolDetails(workspaceId, toolId)

  if (result.status !== 200 || !result.data) {
    return (
      <div className="p-6 md:p-8">
        <p className="text-[13px] text-muted-foreground">
          {result.message ?? 'Unable to load this tool.'}
        </p>
      </div>
    )
  }

  const { tool, callerRole, hasPassedTest, isOwner } = result.data
  const version = tool.versions[0]
  // Full management (edit capabilities, publish/unpublish) only for
  // the owning workspace's OWNER/ADMIN. Any other workspace that
  // installed it — or is browsing a public tool before installing —
  // gets a read-only connect view instead.
  const canManage = isOwner && (callerRole === 'OWNER' || callerRole === 'ADMIN')

  if (!version) {
    return (
      <div className="p-6 md:p-8">
        <p className="text-[13px] text-muted-foreground">
          This tool doesn't have a version yet.
        </p>
      </div>
    )
  }

  const deployment = tool.deployments[0]
  const status = deployment ? deploymentStatusDisplay[deployment.status] : null
  const refreshedAt = deployment?.updatedAt ?? version.createdAt

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-black/10 dark:bg-white/10 flex items-center justify-center overflow-hidden shrink-0">
            {tool.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tool.logoUrl} alt={tool.name} className="w-full h-full object-cover" />
            ) : (
              <Package className="w-4.5 h-4.5 text-muted-foreground" strokeWidth={1.5} />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-medium text-foreground truncate">{tool.name}</h1>
              {status && (
                <span className={`text-[12px] font-medium flex items-center gap-1.5 shrink-0 ${status.className}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  {status.label}
                </span>
              )}
            </div>
            <p className="text-[12.5px] font-mono text-muted-foreground truncate mt-0.5">{version.endpoint}</p>
            <p className="text-[11.5px] text-muted-foreground/70 mt-0.5">
              Refreshed{' '}
              {new Date(refreshedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <ConnectButton slug={tool.slug} endpoint={version.endpoint} />
          {isOwner && (
            <PublishButton
              workspaceId={workspaceId}
              toolId={toolId}
              isPublic={tool.visibility === 'PUBLIC'}
              hasPassedTest={hasPassedTest}
              canManage={canManage}
            />
          )}
        </div>
      </div>


    </div>
  )
}

export default ToolDetailPage