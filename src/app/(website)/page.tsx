"use client"
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Hero() {

    const { isSignedIn, isLoaded } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (isLoaded && isSignedIn) {
            router.push("/callback");
        }
    }, [isLoaded, isSignedIn, router]);

    if (!isLoaded || isSignedIn) return null;

  return (
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
    );
}