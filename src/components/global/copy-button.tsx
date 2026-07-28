"use client"

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

type Props = {
    value: string
    className?: string
}

const CopyButton = ({ value, className }: Props) => {
    const [copied, setCopied] = useState(false)

    const handleCopy = async () => {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
    }

    return (
        <button
            onClick={handleCopy}
            title="Copy to clipboard"
            className={`p-1 rounded text-muted-foreground/70 hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground transition-colors shrink-0 ${className ?? ''}`}
        >
            {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-500" strokeWidth={1.5} />
            ) : (
                <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />
            )}
        </button>
    )
}

export default CopyButton
