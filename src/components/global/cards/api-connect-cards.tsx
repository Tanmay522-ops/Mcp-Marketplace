"use client"

import { useState } from 'react'
import { Key, Loader2, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Props = {
    hasApiKey: boolean
    onSubmit: (apiKey: string) => Promise<void>
    submitting: boolean
    error: string | null
}

const ApiKeyConnectCard = ({ hasApiKey, onSubmit, submitting, error }: Props) => {
    const [apiKey, setApiKey] = useState('')

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!apiKey.trim()) return
        await onSubmit(apiKey.trim())
        setApiKey('')
    }

    return (
        <div className="rounded-xl border border-border/50 bg-card py-16 flex flex-col items-center text-center">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-4">
                <KeyRound className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <h2 className="text-[15px] font-semibold text-foreground mb-1.5">
                {hasApiKey ? 'Update your API key' : 'Connect your API key'}
            </h2>
            <p className="text-[13px] text-muted-foreground max-w-sm mb-5">
                This tool authenticates with a static API key instead of an OAuth login — paste yours below.
                It&apos;s encrypted before it&apos;s stored.
            </p>
            <form onSubmit={handleSubmit} className="flex items-center gap-2 w-full max-w-sm px-6">
                <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Paste your API key"
                    autoComplete="off"
                    className="flex-1 h-9 px-3 rounded-md bg-black/10 dark:bg-white/10 text-[13px] text-foreground placeholder:text-muted-foreground/50 outline-none border border-transparent focus:border-border"
                />
                <Button type="submit" disabled={submitting || !apiKey.trim()}>
                    {submitting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                        <Key className="w-3.5 h-3.5" strokeWidth={1.5} />
                    )}
                    {hasApiKey ? 'Update' : 'Connect'}
                </Button>
            </form>
            {error && <p className="text-[12px] text-red-500 mt-3 px-6">{error}</p>}
        </div>
    )
}

export default ApiKeyConnectCard