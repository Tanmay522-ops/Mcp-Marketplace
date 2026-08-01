import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Was ["/api/sandbox", "/api/install"] — neither path exists anywhere in
// this app, so nothing was actually gated here. These are the two real
// routes that need a Clerk session: your own logged-in users hit these
// directly when connecting a tool (Linear/Notion). Both already do their
// own getCallerContext check too (defense in depth) — this just means an
// unauthenticated hit gets a clean redirect to sign-in instead of a raw
// JSON error.
//
// Deliberately NOT /api/oauth2/* here — those routes implement THIS APP
// as an OAuth provider for third-party MCP clients. /register and /token
// are called server-to-server by those clients with no Clerk session at
// all; requiring one would break that flow entirely. /authorize is
// browser-hit but already handles its own not-logged-in redirect
// internally (see its route.ts), so it doesn't need this either.
const protectedPaths = ["/api/oauth/authorize", "/api/oauth/callback"];

export const proxy = clerkMiddleware(async (auth, req: NextRequest) => {
    const isProtected = protectedPaths.some((path) =>
        req.nextUrl.pathname.startsWith(path)
    );

    if (isProtected) {
        await auth.protect();
    }

    return NextResponse.next();
});

export const config = {
    matcher: [
        // Skip Next.js internals and all static files, unless found in search params
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
        // Always run for API routes
        '/(api|trpc)(.*)',
        // Always run for Clerk-specific frontend API routes
        '/__clerk/(.*)',
    ],
}