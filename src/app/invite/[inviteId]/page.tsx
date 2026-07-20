import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import InviteResponseButtons from './_components/invite-response-buttons'
import { getInviteDetails } from '@/actions/invite'


type Props = {
    params: Promise<{ inviteId: string }>
}

const InvitePage = async ({ params }: Props) => {
    const { inviteId } = await params

    const { userId } = await auth()
    if (!userId) {
        redirect(`/sign-in?redirect_url=/invite/${inviteId}`)
    }

    const result = await getInviteDetails(inviteId)

    if (result.status !== 200 || !result.data) {
        return (
            <div className="flex items-center justify-center min-h-screen px-4">
                <div className="max-w-sm w-full text-center">
                    <p className="text-[14px] text-muted-foreground">
                        {result.message ?? 'This invite could not be found.'}
                    </p>
                </div>
            </div>
        )
    }

    const invite = result.data
    const senderName = invite.sender.firstName
        ? `${invite.sender.firstName} ${invite.sender.lastName ?? ''}`.trim()
        : invite.sender.email

    return (
        <div className="flex items-center justify-center min-h-screen px-4">
            <div className="max-w-sm w-full bg-card border border-border/50 rounded-xl shadow-sm p-6 text-center">
                <div className="w-12 h-12 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-semibold text-[16px] mx-auto mb-4">
                    {invite.workspace.name.charAt(0).toUpperCase()}
                </div>
                <h1 className="text-[15px] font-medium text-foreground mb-1">
                    Join {invite.workspace.name}
                </h1>
                <p className="text-[13px] text-muted-foreground mb-6">
                    {senderName} invited you to join as {invite.role.toLowerCase()}
                </p>

                <InviteResponseButtons inviteId={invite.id} workspaceId={invite.workspace.id} />
            </div>
        </div>
    )
}

export default InvitePage