import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const protectedPaths = ["/api/sandbox", "/api/install"];

export default clerkMiddleware(async (auth, req: NextRequest) => {
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