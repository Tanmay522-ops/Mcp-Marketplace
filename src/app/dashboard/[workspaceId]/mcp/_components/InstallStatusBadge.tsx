// Drop into your installed-servers list page (not one of the files I
// have). One small piece: the status cell shown per row.

import { Link2Off } from 'lucide-react'

type Status = 'NOT_CONNECTED' | 'PENDING' | 'ACTIVE' | 'RUNNING' | 'BUILDING' | 'DEPLOYING' | 'ERROR'

const STATUS_DISPLAY: Record<Status, { label: string; dotClass: string; textClass: string }> = {
    NOT_CONNECTED: { label: 'Not connected', dotClass: '', textClass: 'text-muted-foreground/60' },
    PENDING: { label: 'Pending', dotClass: 'bg-amber-500', textClass: 'text-foreground' },
    ACTIVE: { label: 'Running', dotClass: 'bg-emerald-500', textClass: 'text-foreground' },
    RUNNING: { label: 'Running', dotClass: 'bg-emerald-500', textClass: 'text-foreground' },
    BUILDING: { label: 'Building', dotClass: 'bg-blue-500', textClass: 'text-foreground' },
    DEPLOYING: { label: 'Deploying', dotClass: 'bg-blue-500', textClass: 'text-foreground' },
    ERROR: { label: 'Error', dotClass: 'bg-red-500', textClass: 'text-red-500' },
}

const InstallStatusBadge = ({ status }: { status: Status }) => {
    const display = STATUS_DISPLAY[status]

    if (status === 'NOT_CONNECTED') {
        return (
            <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded border border-border/50 text-[12px] font-medium text-muted-foreground/60">
                <Link2Off className="w-3 h-3" strokeWidth={1.5} />
                {display.label}
            </span>
        )
    }

    return (
        <span className={`inline-flex items-center gap-1.5 text-[13px] font-medium ${display.textClass}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${display.dotClass}`} />
            {display.label}
        </span>
    )
}

export default InstallStatusBadge