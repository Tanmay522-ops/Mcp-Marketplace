"use client"

import { useState } from 'react'

import { WorkspaceSummary } from '../data/data'
import Header from '../header'
import SearchModal from '../sidebar/SearchModal'
import Sidebar from '../sidebar'

type Props = {
    activeWorkspaceId: string
    workspaces: WorkspaceSummary[]
    children: React.ReactNode
}

const DashboardShell = ({ activeWorkspaceId, workspaces, children }: Props) => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(true)
    const [isSearchOpen, setIsSearchOpen] = useState(false)

    const activeWorkspace = workspaces.find((ws) => ws.id === activeWorkspaceId)

    const handleNavigate = () => {
        if (typeof window !== 'undefined' && window.innerWidth < 768) {
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
                className={`
      fixed md:relative inset-y-0 left-0 z-50 md:z-0 h-full shrink-0 min-w-0 overflow-hidden
      transition-transform md:transition-[width,opacity] duration-300 ease-in-out
      ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      ${isSidebarOpen ? 'md:w-[260px] md:opacity-100' : 'md:w-0 md:opacity-0 md:border-none'}
    `}
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
                <div className="flex-1 overflow-y-auto">{children}</div>
            </div>

            <SearchModal open={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
        </div>
    )
}

export default DashboardShell