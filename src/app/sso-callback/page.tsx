'use client';

import { useEffect, useRef, useState } from 'react';
import { useClerk, useSignIn, useSignUp } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useMcpStore } from '@/store/useMcpStore';

export default function SSOCallbackPage() {
    const clerk = useClerk();
    const { signIn, fetchStatus: signInFetchStatus } = useSignIn();
    const { signUp, fetchStatus: signUpFetchStatus } = useSignUp();
    const router = useRouter();
    const { setSignInModalOpen } = useMcpStore();
    const [error, setError] = useState<string | null>(null);
    const hasRun = useRef(false);

    useEffect(() => {
        if (!clerk.loaded) return;
        if (signInFetchStatus === 'fetching' || signUpFetchStatus === 'fetching') return;
        if (!signIn || !signUp) return;
        if (hasRun.current) return;
        hasRun.current = true;

        const complete = async () => {
            try {

                const existingSessionId =
                    signIn.existingSession?.sessionId || signUp.existingSession?.sessionId;
                if (existingSessionId) {
                    await clerk.setActive({
                        session: existingSessionId,
                        navigate: () => router.push('/callback'),
                    });
                    return;
                }
                
                if (signIn.status === 'complete') {
                    await signIn.finalize({ navigate: () => router.push('/callback') });
                    return;
                }

                if (signIn.isTransferable) {
                    const { error: transferError } = await signUp.create({ transfer: true });
                    if (transferError) {
                        console.error('[sso-callback] transfer error', transferError);
                        setError('Could not create your account. Please try again.');
                        return;
                    }
                }

                if (signUp.status === 'complete') {
                    await signUp.finalize({ navigate: () => router.push('/callback') });
                    return;
                }

                if (signUp.status === 'missing_requirements') {
                    setError('More information is needed to finish signing up.');
                    return;
                }

                if (signIn.status === 'needs_second_factor') {
                    setError('Two-factor verification is required. Please sign in again.');
                    return;
                }

                setError('We could not complete sign-in. Please try again.');
            } catch (err) {
                console.error('[sso-callback] unexpected error', err);
                setError('Something went wrong completing sign-in.');
            }
        };

        complete();
    }, [clerk.loaded, signIn, signUp, signInFetchStatus, signUpFetchStatus, router]);

    // There's no standalone /sign-in route in this app — sign-in lives in a
    // modal controlled by useMcpStore. So instead of a plain link, this
    // opens that modal and sends the user home.
    const handleBackToSignIn = () => {
        setSignInModalOpen(true);
        router.push('/');
    };

    return (
        <div className="flex min-h-screen items-center justify-center">
            {error ? (
                <div className="text-center">
                    <p className="text-sm text-destructive mb-2">{error}</p>
                    <button
                        type="button"
                        onClick={handleBackToSignIn}
                        className="text-sm underline text-muted-foreground hover:text-foreground"
                    >
                        Back to sign in
                    </button>
                </div>
            ) : (
                <p className="text-sm text-muted-foreground">Completing sign-in...</p>
            )}
            <div id="clerk-captcha" />
        </div>
    );
}