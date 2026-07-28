import { GitHubIcon } from '@/components/ui/GithubIcon'
import {
    LayoutDashboard,
    Package,
    DownloadCloud,
    Users,
    Mail,
    Activity,
    Settings,
    Bell,
    Search,
    Hash,
    Compass,
} from 'lucide-react'

export type NavItemData = {
    id: string
    title: string
    icon: React.ElementType
    href?: string
    action?: 'open-search'
    badge?: number | string
    shortcut?: string
    children?: NavItemData[]
    hidden?: boolean

}

export type NavGroupData = {
    heading?: string
    items: NavItemData[]
}

export type WorkspaceSummary = {
    id: string
    name: string
    slug: string
    image: string | null
    isOwner: boolean
}

export const getNavGroups = (workspaceId: string): NavGroupData[] => [
    {
        items: [
            {
                id: 'search',
                title: 'Search',
                icon: Search,
                action: 'open-search',
                shortcut: '⌘K',
            },
            {
                id: 'home',
                title: 'Dashboard',
                icon: LayoutDashboard,
                href: `/dashboard/${workspaceId}`,
            },
            {
                id: 'notifications',
                title: 'Notifications',
                icon: Bell,
                href: `/dashboard/${workspaceId}/notifications`,
                children:[
                    {
                        id: 'invites',
                        title: 'Invites',
                        icon: Mail,
                        href: `/dashboard/${workspaceId}/invites`,
                    },
                ]
            },
        ],
    },
    {
        heading: 'Workspace',
        items: [
            {
                id: 'tools',
                title: 'MCP Server',
                icon: Package,
                href: `/dashboard/${workspaceId}/mcp`,
                children:[
                   
                    {
                        
                        id: 'browse',
                        title: 'Browse',
                        icon: Compass,
                        href: `/dashboard/${workspaceId}/browse`,
                        hidden: true,
                    },
                ]
              
            },
            {
                id: 'executions',
                title: 'Executions',
                icon: Activity,
                href: `/dashboard/${workspaceId}/executions`,
                children: [
                    {
                        id: 'executions-smoke',
                        title: 'Smoke Tests',
                        icon: Hash,
                        href: `/dashboard/${workspaceId}/executions?type=SMOKE_TEST`,
                    },
                    {
                        id: 'executions-live',
                        title: 'Try Live',
                        icon: Hash,
                        href: `/dashboard/${workspaceId}/executions?type=TRY_LIVE`,
                    },
                ],
            },
         
        ],
    },
    {
        heading: 'Members',
        items: [
            {
                id: 'members',
                title: 'Members',
                icon: Users,
                href: `/dashboard/${workspaceId}/members`,
            },
        ],
    },
    {
        heading: 'Integrations',
        items: [
            {
                id: 'github',
                title: 'GitHub',
                icon: GitHubIcon,
                href: `/dashboard/${workspaceId}/github`,
            },
        ],
    },
]

export const getBottomNavItems = (workspaceId: string): NavItemData[] => [
    {
        id: 'settings',
        title: 'Settings',
        icon: Settings,
        href: `/dashboard/${workspaceId}/settings`,
        shortcut: '⌘,',
    },
]