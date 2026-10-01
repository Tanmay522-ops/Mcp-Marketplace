"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { onAuthenticateUser } from "@/actions/user";
import { resolveDestinationWorkspaceId } from "@/lib/workspace";
import { useMcpStore } from "@/store/useMcpStore";
import { clearRememberedRedirect, getSsoRedirect } from "@/lib/safe-redirect";

export default function AuthCallbackPage() {
    const router = useRouter();
    const { setSignInModalOpen } = useMcpStore();
    const hasRun = useRef(false);

    useEffect(() => {
        if (hasRun.current) return;
        hasRun.current = true;

        const run = async () => {
            try {
                // Validated `/invite/<id>` path (URL param, or the sessionStorage
                // copy saved before an OAuth round trip). Null for normal sign-ins.
                const inviteRedirect = getSsoRedirect();

                // Must run for invite sign-ups too: acceptInvite looks the
                // user up by clerkId, so the DB row must exist first.
                const auth = await onAuthenticateUser();

                if (auth.status === 200 || auth.status === 201) {
                    // Always clear the stored copy once a sign-in succeeds,
                    // invite or not, so it can't leak into a later sign-in.
                    clearRememberedRedirect();

                    if (inviteRedirect) {
                        router.push(inviteRedirect);
                        return;
                    }

                    const destinationWorkspaceId = resolveDestinationWorkspaceId(auth.user);

                    if (!destinationWorkspaceId) {
                        console.error("[callback] authenticated user has no workspace", auth.user?.id);
                        toast.error("Something went wrong setting up your workspace. Please contact support.");
                        router.push("/");
                        return;
                    }

                    router.push(`/dashboard/${destinationWorkspaceId}`);
                    return;
                }

                if (auth.status === 409) {
                    toast.error("An account with this email already exists. Please sign in with your original method.");
                    setSignInModalOpen(true);
                    router.push("/");
                    return;
                }

                if (auth.status === 403) {
                    // Not authenticated — expected if someone lands here with
                    // no session at all. No toast needed.
                    router.push("/");
                    return;
                }

                // 400, 500, or anything unrecognized.
                console.error("[callback] auth failed", auth);
                toast.error("Something went wrong signing you in. Please try again.");
                setSignInModalOpen(true);
                router.push("/");
            } catch (err) {
                console.error("[callback] unexpected error", err);
                toast.error("Something went wrong signing you in. Please try again.");
                setSignInModalOpen(true);
                router.push("/");
            }
        };

        run();
    }, [router, setSignInModalOpen]);

    return (
        <div className="flex min-h-screen items-center justify-center">
            <p className="text-sm text-muted-foreground">Completing sign-in...</p>
        </div>
    );
}