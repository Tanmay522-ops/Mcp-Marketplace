'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { onAuthenticateUser } from '@/actions/user';
import { resolveDestinationWorkspaceId } from '@/lib/workspace';
import { useMcpStore } from '@/store/useMcpStore';

export default function AuthCallbackPage() {
    const router = useRouter();
    const { setSignInModalOpen } = useMcpStore();
    const hasRun = useRef(false);

    useEffect(() => {
        if (hasRun.current) return;
        hasRun.current = true;

        const run = async () => {
            try {
                // onAuthenticateUser is a server action ("use server") — it's
                // directly callable from client code, no API route or redirect
                // chain needed to get its result here. It's documented to
                // catch its own internal errors and always return a status
                // object rather than throwing, but this try/catch is kept as
                // a defensive backstop in case that contract is ever broken —
                // without it, an unhandled rejection here would leave the
                // user stuck on this screen indefinitely with no feedback.
                const auth = await onAuthenticateUser();

                if (auth.status === 200 || auth.status === 201) {
                    const destinationWorkspaceId = resolveDestinationWorkspaceId(auth.user);

                    if (!destinationWorkspaceId) {
                        console.error('[callback] authenticated user has no workspace', auth.user?.id);
                        toast.error('Something went wrong setting up your workspace. Please contact support.');
                        router.push('/');
                        return;
                    }

                    router.push(`/dashboard/${destinationWorkspaceId}`);
                    return;
                }

                if (auth.status === 409) {
                    toast.error('An account with this email already exists. Please sign in with your original method.');
                    setSignInModalOpen(true);
                    router.push('/');
                    return;
                }

                if (auth.status === 403) {
                    // Not authenticated — the expected path if someone lands
                    // here with no session at all. Nothing went wrong, no
                    // toast needed.
                    router.push('/');
                    return;
                }

                // 400, 500, or anything unrecognized.
                console.error('[callback] auth failed', auth);
                toast.error('Something went wrong signing you in. Please try again.');
                setSignInModalOpen(true);
                router.push('/');
            } catch (err) {
                console.error('[callback] unexpected error', err);
                toast.error('Something went wrong signing you in. Please try again.');
                setSignInModalOpen(true);
                router.push('/');
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