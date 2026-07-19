"use client"

import React from 'react'
import { SignOutButton } from '@clerk/nextjs'
import { LogOut } from 'lucide-react'

import { getNavGroups, getBottomNavItems, WorkspaceSummary } from '../data/data'
import WorkspaceSwitcher from './WorkspaceSwitcher'
import NavItem from './NavItems'


type Props = {
    activeWorkspaceId: string
    workspaces: WorkspaceSummary[]
    onOpenSearch: () => void
    onNavigate?: () => void
}

const Sidebar = ({ activeWorkspaceId, workspaces, onOpenSearch, onNavigate }: Props) => {
    const navGroups = getNavGroups(activeWorkspaceId)
    const bottomItems = getBottomNavItems(activeWorkspaceId)

    return (
        <div className="flex flex-col w-[260px] h-full bg-card border-r border-border/50 p-3 font-sans shrink-0 overflow-hidden">
            <WorkspaceSwitcher workspaces={workspaces} activeWorkspaceId={activeWorkspaceId} />

            <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] flex flex-col gap-4 mt-2">
                {navGroups.map((group, idx) => (
                    <div key={idx} className="flex flex-col gap-0.5">
                        {group.heading && (
                            <span className="px-2.5 mb-1 text-[11px] font-semibold tracking-wider text-muted-foreground/50 uppercase">
                                {group.heading}
                            </span>
                        )}
                        {group.items.map((item) => (
                            <NavItem key={item.id} item={item} onOpenSearch={onOpenSearch} onNavigate={onNavigate} />
                        ))}
                    </div>
                ))}
            </div>

            <div className="mt-auto pt-4 border-t border-border/50 flex flex-col gap-0.5">
                {bottomItems.map((item) => (
                    <NavItem key={item.id} item={item} onNavigate={onNavigate} />
                ))}
                <SignOutButton>
                    <button className="group flex items-center gap-2.5 px-2.5 py-[7px] rounded-[6px] text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground/90 transition-colors w-full text-left">
                        <LogOut
                            className="w-[16px] h-[16px] text-muted-foreground/70 group-hover:text-foreground/70"
                            strokeWidth={1.5}
                        />
                        <span className="text-[13px] tracking-wide">Log out</span>
                    </button>
                </SignOutButton>
            </div>
        </div>
    )
}

export default Sidebar