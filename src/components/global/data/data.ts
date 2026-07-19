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
            },
        ],
    },
    {
        heading: 'Workspace',
        items: [
            {
                id: 'tools',
                title: 'My Tools',
                icon: Package,
                href: `/dashboard/${workspaceId}/tools`,
                children: [
                    {
                        id: 'tools-published',
                        title: 'Published',
                        icon: Hash,
                        href: `/dashboard/${workspaceId}/tools?status=PUBLISHED`,
                    },
                    {
                        id: 'tools-drafts',
                        title: 'Drafts',
                        icon: Hash,
                        href: `/dashboard/${workspaceId}/tools?status=DRAFT`,
                    },
                    {
                        id: 'tools-archived',
                        title: 'Archived',
                        icon: Hash,
                        href: `/dashboard/${workspaceId}/tools?status=ARCHIVED`,
                    },
                ],
            },
            {
                id: 'installs',
                title: 'Installs',
                icon: DownloadCloud,
                href: `/dashboard/${workspaceId}/installs`,
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
            {
                id: 'invites',
                title: 'Invites',
                icon: Mail,
                href: `/dashboard/${workspaceId}/invites`,
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