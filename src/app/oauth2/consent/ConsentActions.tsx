"use client"

// app/oauth2/consent/ConsentActions.tsx

import { useState } from 'react'
import { approveOAuth2Consent, denyOAuth2Consent } from '@/actions/oauth2-consent-actions'

const ConsentActions = ({ requestToken }: { requestToken: string }) => {
    const [pending, setPending] = useState<'allow' | 'deny' | null>(null)
    const [error, setError] = useState<string | null>(null)

    const handle = async (action: 'allow' | 'deny') => {
        setError(null)
        setPending(action)
        const res = action === 'allow' ? await approveOAuth2Consent(requestToken) : await denyOAuth2Consent(requestToken)
        if (res.status !== 200) {
            setPending(null)
            setError(res.message)
            return
        }
        // Full-page navigation — this has to leave your app and land back
        // on the MCP client's own redirect handler.
        window.location.href = res.redirectUrl
    }

    return (
        <div>
            {error && <p className="text-[12.5px] text-red-500 mb-3 text-center">{error}</p>}
            <div className="flex gap-3">
                <button
                    onClick={() => handle('deny')}
                    disabled={pending !== null}
                    className="flex-1 h-10 rounded-md border border-border/50 text-[13px] font-medium text-foreground/80 disabled:opacity-60"
                >
                    Deny
                </button>
                <button
                    onClick={() => handle('allow')}
                    disabled={pending !== null}
                    className="flex-1 h-10 rounded-md bg-primary text-primary-foreground text-[13px] font-medium disabled:opacity-60"
                >
                    {pending === 'allow' ? 'Approving…' : 'Allow'}
                </button>
            </div>
        </div>
    )
}

export default ConsentActions