"use client"

import { usePathname } from 'next/navigation'
import { PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react'
import { UserButton } from '@clerk/nextjs'
import { getNavGroups, getBottomNavItems, NavItemData } from '../data/data'

type Props = {
    workspaceId: string
    workspaceName: string
    isSidebarOpen: boolean
    onToggleSidebar: () => void
    onOpenSearch: () => void
}

const flattenItems = (items: NavItemData[]): NavItemData[] =>
    items.reduce((acc, item) => {
        acc.push(item)
        if (item.children) acc.push(...flattenItems(item.children))
        return acc
    }, [] as NavItemData[])

const Header = ({ workspaceId, workspaceName, isSidebarOpen, onToggleSidebar, onOpenSearch }: Props) => {
    const pathname = usePathname()

    const allItems = [...getNavGroups(workspaceId).flatMap((g) => g.items), ...getBottomNavItems(workspaceId)]
    const flat = flattenItems(allItems)

    const activeItem = flat.find((item) => item.href && item.href.split('?')[0] === pathname)
    const activeTitle = activeItem?.title ?? 'Dashboard'

    return (
        <div className="h-14 border-b border-border/50 flex items-center px-3 sm:px-4 justify-between bg-card shrink-0">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <button
                    onClick={onToggleSidebar}
                    className="p-1.5 rounded-md text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground transition-colors shrink-0"
                >
                    {isSidebarOpen ? (
                        <PanelLeftClose className="w-[18px] h-[18px]" strokeWidth={1.5} />
                    ) : (
                        <PanelLeftOpen className="w-[18px] h-[18px]" strokeWidth={1.5} />
                    )}
                </button>
                <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
                    {/* Workspace name hides on the smallest screens — the page
              title alone is enough context there, and this is the first
              thing that has to give when space runs out. */}
                    <span className="truncate hidden sm:inline">{workspaceName}</span>
                    <span className="hidden sm:inline">/</span>
                    <span className="font-medium text-foreground truncate">{activeTitle}</span>
                </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                {/* Full search box — desktop/tablet only */}
                <button
                    onClick={onOpenSearch}
                    className="w-64 h-8 bg-black/5 dark:bg-white/5 rounded-md hidden md:flex items-center gap-2 px-3 text-[12px] text-muted-foreground/70 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                >
                    <Search className="w-3.5 h-3.5" strokeWidth={1.5} />
                    Search...
                </button>
                <button
                    onClick={onOpenSearch}
                    className="p-1.5 rounded-md text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground transition-colors md:hidden"
                >
                    <Search className="w-[18px] h-[18px]" strokeWidth={1.5} />
                </button>
                <UserButton />
            </div>
        </div>
    )
}

export default Header