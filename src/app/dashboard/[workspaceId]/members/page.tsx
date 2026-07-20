import { getWorkspaceMembers } from '@/actions/workspace'
import MembersTable from '@/components/global/Members/MembersTable'


type Props = {
    params: Promise<{ workspaceId: string }>
}

const MembersPage = async ({ params }: Props) => {
    const { workspaceId } = await params

    const result = await getWorkspaceMembers(workspaceId)

    if (result.status !== 200 || !result.data) {
        return (
            <div className="p-6 md:p-8">
                <p className="text-[13px] text-muted-foreground">
                    {result.status !== 200 ? result.message : 'Unable to load members.'}
                </p>
            </div>
        )
    }

    const { callerId, members } = result.data

    return (
        <div className="p-6 md:p-8">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-lg font-medium text-foreground">Members</h1>
                    <p className="text-[13px] text-muted-foreground mt-0.5">
                        {members.length} {members.length === 1 ? 'person' : 'people'} in this workspace
                    </p>
                </div>
            </div>

            <MembersTable workspaceId={workspaceId} callerId={callerId} />
        </div>
    )
}

export default MembersPage