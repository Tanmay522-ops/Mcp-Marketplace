"use client"

// Drop into your browse/marketplace page (not one of the files I have),
// replacing the plain "Add" button for each featured tool card.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { installMarketplaceTool } from '@/actions/tool-connect-actions'

type Props = {
    workspaceId: string
    toolVersionId: string
}

const AddToolButton = ({ workspaceId, toolVersionId }: Props) => {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleAdd = async () => {
        setError(null)
        setLoading(true)
        const res = await installMarketplaceTool({ workspaceId, toolVersionId })
        setLoading(false)

        if (res.status !== 200 || !res.data) {
            setError(res.message ?? 'Failed to add')
            return
        }

        // Lands on the tool detail page, which reads the install's status
        // and renders the right one of the 3 states itself.
        router.push(`/dashboard/${workspaceId}/mcp/${res.data.toolSlug}`)
    }

    return (
        <div>
            <button
                onClick={handleAdd}
                disabled={loading}
                className="h-8 px-3 rounded-md bg-black/10 dark:bg-white/10 text-[12.5px] font-medium text-foreground disabled:opacity-60"
            >
                {loading ? 'Adding…' : 'Add'}
            </button>
            {error && <p className="text-[11.5px] text-red-500 mt-1">{error}</p>}
        </div>
    )
}

export default AddToolButton