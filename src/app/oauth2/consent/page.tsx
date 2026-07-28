// app/oauth2/consent/page.tsx
//
// The actual human-facing login moment — "ClientName wants access to
// ToolName in WorkspaceName. Allow or Deny?" Mirrors the Sentry/Asana
// consent screens from your screenshots, except this one is yours.

import { getConsentDisplayInfo } from "@/actions/oauth2-consent-actions"
import ConsentActions from "./ConsentActions"

type Props = {
    searchParams: Promise<{ request?: string }>
}

const ConsentPage = async ({ searchParams }: Props) => {
    const { request } = await searchParams

    if (!request) {
        return <ConsentError message="Missing authorization request." />
    }

    const info = await getConsentDisplayInfo(request)
    if (info.status !== 200) {
        return <ConsentError message={info.message} />
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-background px-4">
            <div className="w-full max-w-md border border-border/50 rounded-xl p-6">
                <h1 className="text-[18px] font-semibold text-foreground text-center mb-1">
                    {info.data.clientName} is requesting access
                </h1>
                <p className="text-[13px] text-muted-foreground text-center mb-6">
                    to <span className="font-medium text-foreground">{info.data.toolName}</span> in{' '}
                    <span className="font-medium text-foreground">{info.data.workspaceName}</span>
                </p>

                {info.data.scope && (
                    <div className="rounded-lg bg-black/5 dark:bg-white/5 px-3 py-2.5 mb-6">
                        <p className="text-[11.5px] text-muted-foreground">Requested scope</p>
                        <p className="text-[13px] font-mono text-foreground">{info.data.scope}</p>
                    </div>
                )}

                <ConsentActions requestToken={request} />
            </div>
        </div>
    )
}

const ConsentError = ({ message }: { message: string }) => (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-md border border-border/50 rounded-xl p-6 text-center">
            <p className="text-[14px] text-red-500">{message}</p>
        </div>
    </div>
)

export default ConsentPage