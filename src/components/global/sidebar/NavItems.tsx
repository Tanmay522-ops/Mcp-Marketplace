"use client"

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { NavItemData } from '../data/data'

type Props = {
    item: NavItemData
    onOpenSearch?: () => void
    onNavigate?: () => void
    level?: number
}

const NavItem = ({ item, onOpenSearch, onNavigate, level = 0 }: Props) => {
    const pathname = usePathname()
    const hasChildren = !!item.children?.length
    const [isOpen, setIsOpen] = useState(false)

    const isActive = !!item.href && pathname === item.href

    const content = (
        <div className="flex items-center justify-between w-full min-w-0">
            <div className="flex items-center gap-2.5 min-w-0">
                <item.icon
                    className={`w-[23px] h-[23px] shrink-0 transition-colors ${isActive ? 'text-foreground' : 'text-muted-foreground/70 group-hover:text-foreground/70'
                        }`}
                    strokeWidth={1.5}
                />
                <span className="text-[13px] tracking-wide truncate">{item.title}</span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
                {item.shortcut && (
                    <kbd className="hidden group-hover:inline-flex items-center justify-center h-5 px-1.5 text-[10px] font-medium font-mono text-muted-foreground/60 bg-background/50 border border-border/50 rounded-[4px] shadow-xs">
                        {item.shortcut}
                    </kbd>
                )}
                {item.badge !== undefined && (
                    <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-medium rounded-full bg-primary/10 text-primary">
                        {item.badge}
                    </span>
                )}
                {hasChildren && (
                    <ChevronRight
                        className={`w-3.5 h-3.5 text-muted-foreground/50 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''
                            }`}
                        strokeWidth={2}
                    />
                )}
            </div>
        </div>
    )

    const rowClassName = `group flex items-center px-2.5 py-[9px] rounded-[6px] transition-all duration-200 select-none cursor-pointer
    ${isActive
            ? 'bg-black/5 dark:bg-white/10 text-foreground font-medium'
            : 'text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground/90'
        }`

    if (item.action === 'open-search') {
        return (
            <button
                type="button"
                onClick={onOpenSearch}
                style={{ paddingLeft: `${level * 12 + 10}px` }}
                className={`${rowClassName} w-full text-left`}
            >
                {content}
            </button>
        )
    }

    if (hasChildren) {
        return (
            <div className="flex flex-col w-full min-w-0">
                <div
                    onClick={() => setIsOpen(!isOpen)}
                    style={{ paddingLeft: `${level * 12 + 10}px` }}
                    className={rowClassName}
                >
                    {content}
                </div>

                <div
                    className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                        }`}
                >
                    <div className="overflow-hidden min-h-0 flex flex-col gap-0.5 mt-0.5">
                        {item.children!.map((child) => (
                            <NavItem
                                key={child.id}
                                item={child}
                                onOpenSearch={onOpenSearch}
                                onNavigate={onNavigate}
                                level={level + 1}
                            />
                        ))}
                    </div>
                </div>
            </div>
        )
    }

    return (
        <Link
            href={item.href ?? '#'}
            onClick={onNavigate}
            style={{ paddingLeft: `${level * 12 + 10}px` }}
            className={rowClassName}
        >
            {content}
        </Link>
    )
}

export default NavItem