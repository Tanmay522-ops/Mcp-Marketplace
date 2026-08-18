"use client"
import { useAuth } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { useEffect, Suspense } from "react";

// FIXED: `useSearchParams()` was used directly in the page's default
// export, with no <Suspense> boundary — Next.js App Router requires one
// around any use of useSearchParams(), or it can break client-side
// interactivity for the WHOLE page (not just this piece), which matched
// exactly what was reported: buttons on this page doing nothing at all,
// including the Sign In button — unrelated to Sign In's own code, this
// was breaking hydration for everything on the page. Isolating the
// redirect logic into its own small component and wrapping only that in
// Suspense keeps the rest of the page safe even if this part is still
// loading/erroring.
function RedirectAfterSignIn() {
    // `redirect_to` (set by /api/oauth2/authorize when a signed-out user
    // hits it — see that route's comments) was never actually being read
    // anywhere in this codebase. That meant a user landing here
    // mid-OAuth-flow, signing in, then... nothing — they'd just sit on
    // this page forever, looking like sign-in silently did nothing, since
    // the browser was never sent onward to continue the flow it came from.
    const { isSignedIn, isLoaded } = useAuth();
    const searchParams = useSearchParams();

    useEffect(() => {
        if (!isLoaded || !isSignedIn) return
        const redirectTo = searchParams.get("redirect_to")
        if (!redirectTo) return
        // Full navigation, not router.push — redirectTo points at an API
        // route (/api/oauth2/authorize), not a page, and is already an
        // absolute URL (built server-side against NEXT_PUBLIC_GATEWAY_BASE_URL).
        window.location.href = redirectTo
    }, [isLoaded, isSignedIn, searchParams])

    return null
}

export default function Hero() {
    return (
        <>
            <Suspense fallback={null}>
                <RedirectAfterSignIn />
            </Suspense>
            <section className="w-full py-24 md:py-32">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-12">
                    <div className="flex flex-col gap-6">
                        <h1 className="text-5xl md:text-6xl font-medium tracking-tight text-foreground leading-[1.1]">
                            MCP Server
                            <br />
                            Marketplace
                        </h1>
                        <div className="flex items-center gap-3 mt-2">
                            <a
                                href="/search"
                                className="rounded-full bg-primary text-primary-foreground px-6 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
                            >
                                Browse tools
                            </a>
                            <a
                                href="/publish"
                                className="rounded-full border border-border px-6 py-2.5 text-sm font-medium text-foreground hover:bg-accent transition-colors"
                            >
                                Publish a tool
                            </a>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2 md:pt-2">
                        <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
                            For AI agents
                        </span>
                        <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
                            To discover and call real tools
                        </span>
                        <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
                            Tested before you trust them
                        </span>
                    </div>
                </div >
            </section >
        </>
    );
}