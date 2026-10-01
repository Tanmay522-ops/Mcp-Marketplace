import { redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import InviteResponseButtons from "./_components/invite-response-buttons"
import SwitchAccountButton from "./_components/switch-account-button"
import { getInviteDetails } from "@/actions/invite"
import { onAuthenticateUser } from "@/actions/user"

type Props = {
    params: Promise<{ inviteId: string }>
}

const InvitePage = async ({ params }: Props) => {
    const { inviteId } = await params
    const invitePath = `/invite/${inviteId}`
    const signInUrl = `/sign-in?redirect_url=${encodeURIComponent(invitePath)}`

    const { userId } = await auth()
    if (!userId) {
        redirect(signInUrl)
    }

    // A Clerk session can exist without a DB row (never passed /callback).
    // acceptInvite needs that row, so make sure it exists.
    const authResult = await onAuthenticateUser()
    if (authResult.status !== 200 && authResult.status !== 201) {
        return (
            <div className="flex items-center justify-center min-h-screen px-4">
                <div className="max-w-sm w-full text-center">
                    <p className="text-[14px] text-muted-foreground">
                        Something went wrong signing you in. Please try again.
                    </p>
                </div>
            </div>
        )
    }

    const result = await getInviteDetails(inviteId)

    if (result.status !== 200) {
        const wrongAccount = result.status === 403

        return (
            <div className="flex items-center justify-center min-h-screen px-4">
                <div className="max-w-sm w-full text-center flex flex-col items-center gap-4">
                    <p className="text-[14px] text-muted-foreground">
                        {result.message ?? "This invite could not be found."}
                    </p>
                    {wrongAccount && <SwitchAccountButton redirectUrl={signInUrl} />}
                </div>
            </div>
        )
    }

    const invite = result.data
    const senderName = invite.sender.firstName
        ? `${invite.sender.firstName} ${invite.sender.lastName ?? ""}`.trim()
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

                <InviteResponseButtons inviteId={invite.id} />
            </div>
        </div>
    )
}

export default InvitePage