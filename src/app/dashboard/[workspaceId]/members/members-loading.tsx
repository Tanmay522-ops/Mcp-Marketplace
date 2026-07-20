const MembersLoading = () => {
    return (
        <div className="p-6 md:p-8">
            <div className="mb-6">
                <div className="h-6 w-24 bg-black/5 dark:bg-white/5 rounded-md animate-pulse" />
                <div className="h-4 w-36 bg-black/5 dark:bg-white/5 rounded-md animate-pulse mt-2" />
            </div>

            <div className="w-full bg-card rounded-xl border border-border/50 shadow-sm overflow-hidden">
                <div className="divide-y divide-border/50">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3 px-5 py-3.5">
                            <div className="w-8 h-8 rounded-full bg-black/5 dark:bg-white/5 animate-pulse shrink-0" />
                            <div className="flex flex-col gap-1.5">
                                <div className="h-3 w-32 bg-black/5 dark:bg-white/5 rounded animate-pulse" />
                                <div className="h-2.5 w-44 bg-black/5 dark:bg-white/5 rounded animate-pulse" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

export default MembersLoading