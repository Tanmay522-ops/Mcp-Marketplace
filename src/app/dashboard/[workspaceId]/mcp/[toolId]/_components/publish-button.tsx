"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Globe, Lock, Loader2 } from 'lucide-react'
import { publishTool, unpublishTool } from '@/actions/tool-version-action'


type Props = {
    workspaceId: string
    toolId: string
    isPublic: boolean
    hasPassedTest: boolean
    canManage: boolean
}

const PublishButton = ({ workspaceId, toolId, isPublic, hasPassedTest, canManage }: Props) => {
    const router = useRouter()
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    if (!canManage) {
        return (
            <span
                className={`h-8 px-3 rounded-md text-[12.5px] font-medium flex items-center gap-1.5 ${isPublic ? 'bg-emerald-500/10 text-emerald-500' : 'bg-black/5 dark:bg-white/5 text-muted-foreground'
                    }`}
            >
                {isPublic ? <Globe className="w-3.5 h-3.5" strokeWidth={1.5} /> : <Lock className="w-3.5 h-3.5" strokeWidth={1.5} />}
                {isPublic ? 'Public' : 'Private'}
            </span>
        )
    }

    const handleToggle = async () => {
        setError(null)
        setIsSubmitting(true)
        const res = isPublic
            ? await unpublishTool(workspaceId, toolId)
            : await publishTool(workspaceId, toolId)
        setIsSubmitting(false)

        if (res.status !== 200) {
            setError(res.message ?? 'Failed to update')
            return
        }

        router.refresh()
    }

    // Not public yet, and no passing test — show why the button is
    // disabled instead of just graying it out with no explanation.
    if (!isPublic && !hasPassedTest) {
        return (
            <div className="flex flex-col items-end gap-1">
                <button
                    disabled
                    title="Run a passing smoke test first"
                    className="h-8 px-3 rounded-md bg-black/5 dark:bg-white/5 text-muted-foreground/50 text-[12.5px] font-medium flex items-center gap-1.5 cursor-not-allowed"
                >
                    <Globe className="w-3.5 h-3.5" strokeWidth={1.5} />
                    Publish to marketplace
                </button>
                <span className="text-[11px] text-muted-foreground/70">Needs a passing smoke test</span>
            </div>
        )
    }

    return (
        <div className="flex flex-col items-end gap-1">
            <button
                onClick={handleToggle}
                disabled={isSubmitting}
                className={`h-8 px-3 rounded-md text-[12.5px] font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50 ${isPublic
                        ? 'bg-black/5 dark:bg-white/5 text-foreground hover:bg-black/10 dark:hover:bg-white/10'
                        : 'bg-primary text-primary-foreground hover:bg-primary/90'
                    }`}
            >
                {isSubmitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : isPublic ? (
                    <Lock className="w-3.5 h-3.5" strokeWidth={1.5} />
                ) : (
                    <Globe className="w-3.5 h-3.5" strokeWidth={1.5} />
                )}
                {isPublic ? 'Make private' : 'Publish to marketplace'}
            </button>
            {error && <span className="text-[11px] text-red-500">{error}</span>}
        </div>
    )
}

export default PublishButton