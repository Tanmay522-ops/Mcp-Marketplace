"use client"

// Drop this into your tool detail page (wherever that lives — not one of
// the files I have). Lets a deployer flag "this server needs to log into
// a third party" after the fact, since toolId only exists post-deploy.

import { useState } from 'react'
import { configureCustomToolAuth } from '@/actions/tool-auth-actions'

type Props = {
    workspaceId: string
    toolId: string
    initialRequiresAuth: boolean
    initialAuthorizeUrl?: string
    initialTokenUrl?: string
    initialClientId?: string
    initialScopes?: string
}

const ToolAuthSettings = ({
    workspaceId,
    toolId,
    initialRequiresAuth,
    initialAuthorizeUrl = '',
    initialTokenUrl = '',
    initialClientId = '',
    initialScopes = '',
}: Props) => {
    const [requiresAuth, setRequiresAuth] = useState(initialRequiresAuth)
    const [authorizeUrl, setAuthorizeUrl] = useState(initialAuthorizeUrl)
    const [tokenUrl, setTokenUrl] = useState(initialTokenUrl)
    const [clientId, setClientId] = useState(initialClientId)
    const [clientSecret, setClientSecret] = useState('') // never pre-filled — write-only
    const [scopes, setScopes] = useState(initialScopes)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [saved, setSaved] = useState(false)

    const handleSave = async () => {
        setError(null)
        setSaved(false)
        setSaving(true)
        const res = await configureCustomToolAuth({
            workspaceId,
            toolId,
            requiresAuth,
            oauthAuthorizeUrl: authorizeUrl,
            oauthTokenUrl: tokenUrl,
            oauthClientId: clientId,
            oauthClientSecret: clientSecret || undefined,
            oauthScopes: scopes,
        })
        setSaving(false)
        if (res.status !== 200) {
            setError(res.message ?? 'Failed to save')
            return
        }
        setClientSecret('') // clear the input; it's write-only from here on
        setSaved(true)
    }

    return (
        <div className="border border-border/50 rounded-lg p-4 flex flex-col gap-3">
            <label className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                <input
                    type="checkbox"
                    checked={requiresAuth}
                    onChange={(e) => setRequiresAuth(e.target.checked)}
                />
                This server needs to log into a third-party service before it can be used
            </label>

            {requiresAuth && (
                <>
                    <input
                        value={authorizeUrl}
                        onChange={(e) => setAuthorizeUrl(e.target.value)}
                        placeholder="Authorize URL (e.g. https://provider.com/oauth/authorize)"
                        className="h-9 px-3 rounded-md bg-black/5 dark:bg-white/5 text-[13px] outline-none"
                    />
                    <input
                        value={tokenUrl}
                        onChange={(e) => setTokenUrl(e.target.value)}
                        placeholder="Token URL (e.g. https://provider.com/oauth/token)"
                        className="h-9 px-3 rounded-md bg-black/5 dark:bg-white/5 text-[13px] outline-none"
                    />
                    <input
                        value={clientId}
                        onChange={(e) => setClientId(e.target.value)}
                        placeholder="Client ID"
                        className="h-9 px-3 rounded-md bg-black/5 dark:bg-white/5 text-[13px] outline-none"
                    />
                    <input
                        value={clientSecret}
                        onChange={(e) => setClientSecret(e.target.value)}
                        placeholder="Client secret (leave blank to keep the existing one)"
                        type="password"
                        className="h-9 px-3 rounded-md bg-black/5 dark:bg-white/5 text-[13px] outline-none"
                    />
                    <input
                        value={scopes}
                        onChange={(e) => setScopes(e.target.value)}
                        placeholder="Scopes (space-separated, optional)"
                        className="h-9 px-3 rounded-md bg-black/5 dark:bg-white/5 text-[13px] outline-none"
                    />
                </>
            )}

            {error && <p className="text-[12px] text-red-500">{error}</p>}
            {saved && <p className="text-[12px] text-emerald-500">Saved.</p>}

            <button
                onClick={handleSave}
                disabled={saving}
                className="h-9 rounded-md bg-primary text-primary-foreground text-[13px] font-medium disabled:opacity-50"
            >
                {saving ? 'Saving…' : 'Save'}
            </button>
        </div>
    )
}

export default ToolAuthSettings