"use client"

import { useState } from 'react'
import type { ReactNode } from 'react'

import { WorkspaceSummary } from '../data/data'
import Header from '../header'
import SearchModal from '../sidebar/SearchModal'
import Sidebar from '../sidebar'

// Tailwind's `md` breakpoint — kept as a single named constant so the JS
// check below and the `md:` classes in the JSX never silently drift apart
// if the breakpoint is ever changed.
const MOBILE_BREAKPOINT_PX = 768

type Props = {
    activeWorkspaceId: string
    workspaces: WorkspaceSummary[]
    children: ReactNode
}

const DashboardShell = ({ activeWorkspaceId, workspaces, children }: Props) => {
    // Defaults to open on desktop, closed on mobile — checked once on
    // mount via the lazy initializer, guarded for SSR since `window`
    // doesn't exist during server rendering.
    const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
        if (typeof window === 'undefined') return true
        return window.innerWidth >= MOBILE_BREAKPOINT_PX
    })
    const [isSearchOpen, setIsSearchOpen] = useState(false)

    const activeWorkspace = workspaces.find((ws) => ws.id === activeWorkspaceId)

    if (!activeWorkspace) {
        // Layout already verified access to this workspace before ever
        // rendering this component, so this should be unreachable in
        // practice — logged so a real data inconsistency doesn't fail
        // silently as just an empty header title.
        console.error('[DashboardShell] activeWorkspaceId not found in workspaces list', {
            activeWorkspaceId,
            workspaceIds: workspaces.map((ws) => ws.id),
        })
    }

    const handleNavigate = () => {
        if (typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT_PX) {
            setIsSidebarOpen(false)
        }
    }

    return (
        <div className="flex h-screen w-screen overflow-hidden">
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/40 md:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            <div
                className={`fixed md:relative inset-y-0 left-0 z-50 md:z-0 h-full shrink-0 min-w-0 overflow-hidden transition-transform md:transition-[width,opacity] duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
                    } ${isSidebarOpen ? 'md:w-[260px] md:opacity-100' : 'md:w-0 md:opacity-0 md:border-none'}`}
            >
                <Sidebar
                    activeWorkspaceId={activeWorkspaceId}
                    workspaces={workspaces}
                    onOpenSearch={() => setIsSearchOpen(true)}
                    onNavigate={handleNavigate}
                />
            </div>

            <div className="flex-1 flex flex-col min-w-0">
                <Header
                    workspaceId={activeWorkspaceId}
                    workspaceName={activeWorkspace?.name ?? ''}
                    isSidebarOpen={isSidebarOpen}
                    onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
                    onOpenSearch={() => setIsSearchOpen(true)}
                />
                <div className="flex-1 overflow-y-auto">
                    <div className="max-w-[90rem] mx-auto">{children}</div>
                </div>
            </div>

            <SearchModal open={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
        </div>
    )
}

export default DashboardShell