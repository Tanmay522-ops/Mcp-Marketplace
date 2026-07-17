'use client';
import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { createPortal } from 'react-dom';
import {
    NavigationMenu,
    NavigationMenuContent,
    NavigationMenuItem,
    NavigationMenuLink,
    NavigationMenuList,
    NavigationMenuTrigger,
} from '@/components/ui/navigation-menu';
import { LucideIcon } from 'lucide-react';
import {
    SearchIcon,
    PackageIcon,
    ShieldCheckIcon,
    GitBranchIcon,
    FileText,
    HelpCircle,
    BookOpen,
} from 'lucide-react';
import { MenuToggleIcon } from './menu-toggle-icon';
import { SignInModal } from '@/app/(auth)/_components/SignInModal';
import { SignUpModal } from '@/app/(auth)/_components/SignUpModal';


type LinkItem = {
    title: string;
    href: string;
    icon: LucideIcon;
    description?: string;
};

export function Header() {
    const [open, setOpen] = React.useState(false);
    const scrolled = useScroll(10);

    React.useEffect(() => {
        if (open) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [open]);

    return (
        <header
            className={cn('sticky top-0 z-50 w-full border-b border-transparent bg-black', {
                'bg-background/95 supports-[backdrop-filter]:bg-background/80 border-border backdrop-blur-lg':
                    scrolled,
            })}
        >
            <nav className="mx-auto flex w-full max-w-9xl items-center justify-between">
                <div className="flex items-center gap-6">
                    <a href="/" className="hover:bg-white/5 rounded-md p-2">
                        <WordmarkIcon className="h-6 text-white" />
                    </a>
                    <NavigationMenu className="hidden md:flex">
                        <NavigationMenuList>
                            <NavigationMenuItem>
                                <NavigationMenuTrigger className="bg-transparent text-muted-foreground hover:text-foreground">
                                    Explore
                                </NavigationMenuTrigger>
                                <NavigationMenuContent className="bg-background p-1 pr-1.5">
                                    <ul className="bg-popover grid w-lg grid-cols-2 gap-2 rounded-md  p-2 shadow">
                                        {exploreLinks.map((item, i) => (
                                            <li key={i}>
                                                <ListItem {...item} />
                                            </li>
                                        ))}
                                    </ul>
                                </NavigationMenuContent>
                            </NavigationMenuItem>
                            <NavigationMenuItem>
                                <NavigationMenuTrigger className="bg-transparent text-muted-foreground hover:text-foreground">
                                    Resources
                                </NavigationMenuTrigger>
                                <NavigationMenuContent className="bg-background p-1 pr-1.5 pb-1.5">
                                    <ul className="bg-popover w-64 rounded-md p-2 shadow">
                                        {resourceLinks.map((item, i) => (
                                            <li key={i}>
                                                <ListItem {...item} />
                                            </li>
                                        ))}
                                    </ul>
                                </NavigationMenuContent>
                            </NavigationMenuItem>
                            <NavigationMenuItem>
                                <NavigationMenuLink href="/enterprise" className="px-4 text-sm text-muted-foreground hover:text-foreground rounded-md p-2">
                                    Enterprise
                                </NavigationMenuLink>
                            </NavigationMenuItem>
                            <NavigationMenuItem>
                                <NavigationMenuLink href="/pricing" className="px-4 text-sm text-muted-foreground hover:text-foreground rounded-md p-2">
                                    Pricing
                                </NavigationMenuLink>
                            </NavigationMenuItem>
                        </NavigationMenuList>
                    </NavigationMenu>
                </div>
                <div className="hidden items-center gap-4 md:flex">
                  <SignInModal/>
                  <SignUpModal/>
                </div>
                <Button
                    size="icon"
                    variant="outline"
                    onClick={() => setOpen(!open)}
                    className="md:hidden border-white/20 text-white"
                    aria-expanded={open}
                    aria-controls="mobile-menu"
                    aria-label="Toggle menu"
                >
                    <MenuToggleIcon open={open} className="size-5" duration={300} />
                </Button>
            </nav>
            <MobileMenu open={open} className="flex flex-col justify-between gap-2 overflow-y-auto">
                <div className="flex w-full flex-col gap-y-2">
                    <span className="text-sm text-white/60">Explore</span>
                    {exploreLinks.map((link) => (
                        <MobileListItem key={link.title} {...link} />
                    ))}
                    <span className="text-sm text-white/60">Resources</span>
                    {resourceLinks.map((link) => (
                        <MobileListItem key={link.title} {...link} />
                    ))}
                </div>
                <div className="flex flex-col gap-2">
                    <Button variant="outline" className="w-full bg-transparent text-white border-white/20">
                        Log In
                    </Button>
                    <Button className="w-full bg-white text-black hover:bg-white/90">
                        Sign Up
                    </Button>
                </div>
            </MobileMenu>
        </header>
    );
}

type MobileMenuProps = React.ComponentProps<'div'> & {
    open: boolean;
};

function MobileMenu({ open, children, className, ...props }: MobileMenuProps) {
    if (!open || typeof window === 'undefined') return null;

    return createPortal(
        <div
            id="mobile-menu"
            className={cn(
                'bg-black/95 supports-[backdrop-filter]:bg-black/80 backdrop-blur-lg',
                'fixed top-14 right-0 bottom-0 left-0 z-40 flex flex-col overflow-hidden border-y md:hidden',
            )}
        >
            <div
                data-slot={open ? 'open' : 'closed'}
                className={cn(
                    'data-[slot=open]:animate-in data-[slot=open]:zoom-in-97 ease-out',
                    'size-full p-4',
                    className,
                )}
                {...props}
            >
                {children}
            </div>
        </div>,
        document.body,
    );
}

function ListItem({
    title,
    description,
    icon: Icon,
    className,
    href,
    ...props
}: React.ComponentProps<typeof NavigationMenuLink> & LinkItem) {
    return (
        <NavigationMenuLink
            href={href}
            className={cn(
                "w-full flex flex-row gap-x-2 rounded-sm p-2 hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
                className
            )}
            {...props}
        >
            <div className=" flex aspect-square size-12 items-center justify-center rounded-md  shadow-sm">
                <Icon className="text-foreground size-5" />
            </div>
            <div className="flex flex-col items-start justify-center">
                <span className="font-medium">{title}</span>
                {description && (
                    <span className="text-muted-foreground text-xs">
                        {description}
                    </span>
                )}
            </div>
        </NavigationMenuLink>
    );
}

function MobileListItem({ title, description, icon: Icon, href }: LinkItem) {
    return (
        <a
            href={href}
            className="w-full flex flex-row gap-x-2 rounded-sm p-2 hover:bg-accent hover:text-accent-foreground"
        >
            <div className="flex aspect-square size-12 items-center justify-center rounded-md shadow-sm">
                <Icon className="text-foreground size-5" />
            </div>
            <div className="flex flex-col items-start justify-center">
                <span className="font-medium">{title}</span>
                {description && (
                    <span className="text-muted-foreground text-xs">{description}</span>
                )}
            </div>
        </a >
    );
}

const exploreLinks: LinkItem[] = [
    {
        title: 'Browse Tools',
        href: '/search',
        description: 'Search the MCP tool registry',
        icon: SearchIcon,
    },
    {
        title: 'Publish a Tool',
        href: '/publish',
        description: 'List your MCP server on the marketplace',
        icon: PackageIcon,
    },
    {
        title: 'Versioning',
        href: '/docs/versioning',
        description: 'How semver pinning works',
        icon: GitBranchIcon,
    },
    {
        title: 'Live Sandbox',
        href: '/docs/sandbox',
        description: 'Test tools before you install them',
        icon: ShieldCheckIcon,
    },
];

const resourceLinks: LinkItem[] = [
    {
        title: 'Documentation',
        href: '/docs',
        icon: BookOpen,
    },
    {
        title: 'Help Center',
        href: '/help',
        icon: HelpCircle,
    },
    {
        title: 'Terms of Service',
        href: '/terms',
        icon: FileText,
    },
];

function useScroll(threshold: number) {
    const [scrolled, setScrolled] = React.useState(false);

    const onScroll = React.useCallback(() => {
        setScrolled(window.scrollY > threshold);
    }, [threshold]);

    React.useEffect(() => {
        window.addEventListener('scroll', onScroll);
        return () => window.removeEventListener('scroll', onScroll);
    }, [onScroll]);

    React.useEffect(() => {
        onScroll();
    }, [onScroll]);

    return scrolled;
}

const WordmarkIcon = (props: React.ComponentProps<"svg">) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
        <path d="M12 2L2 20h20L12 2z" />
    </svg>
);