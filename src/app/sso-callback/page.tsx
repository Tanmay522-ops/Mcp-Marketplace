'use client';

import { useEffect, useRef, useState } from 'react';
import { useClerk, useSignIn, useSignUp } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useMcpStore } from '@/store/useMcpStore';
import { getSsoCallbackUrl, getSsoRedirect } from '@/lib/safe-redirect';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type SecondFactorStrategy = 'totp' | 'phone_code' | 'backup_code' | null;

export default function SSOCallbackPage() {
    const clerk = useClerk();
    const { signIn, fetchStatus: signInFetchStatus } = useSignIn();
    const { signUp, fetchStatus: signUpFetchStatus } = useSignUp();
    const router = useRouter();
    const { setSignInModalOpen } = useMcpStore();
    const [error, setError] = useState<string | null>(null);
    const hasRun = useRef(false);

    // 2FA state — mirrors SignInForm's second-factor handling, needed here
    // separately because OAuth sign-in never goes through SignInForm at all.
    const [needsSecondFactor, setNeedsSecondFactor] = useState(false);
    const [secondFactorStrategy, setSecondFactorStrategy] = useState<SecondFactorStrategy>(null);
    const [secondFactorCode, setSecondFactorCode] = useState('');
    const [hasBackupCodeOption, setHasBackupCodeOption] = useState(false);
    const [hasPhoneCodeOption, setHasPhoneCodeOption] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);

    useEffect(() => {
        if (!clerk.loaded) return;
        if (signInFetchStatus === 'fetching' || signUpFetchStatus === 'fetching') return;
        if (!signIn || !signUp) return;
        if (hasRun.current) return;
        hasRun.current = true;

        const startSecondFactor = async () => {
            const factors = signIn.supportedSecondFactors ?? [];
            const totpFactor = factors.find((f) => f.strategy === 'totp');
            const phoneFactor = factors.find((f) => f.strategy === 'phone_code');
            const backupFactor = factors.find((f) => f.strategy === 'backup_code');

            setHasBackupCodeOption(!!backupFactor);
            setHasPhoneCodeOption(!!phoneFactor);

            if (totpFactor) {
                setSecondFactorStrategy('totp');
                setNeedsSecondFactor(true);
                return;
            }

            if (phoneFactor) {
                try {
                    await signIn.mfa.sendPhoneCode();
                    setSecondFactorStrategy('phone_code');
                    setNeedsSecondFactor(true);
                } catch (err) {
                    console.error('[sso-callback] sendPhoneCode error', err);
                    setError('Could not send a verification code. Please try again.');
                }
                return;
            }

            if (backupFactor) {
                setSecondFactorStrategy('backup_code');
                setNeedsSecondFactor(true);
                return;
            }

            setError('Two-factor verification is required, but no supported method was found.');
        };

        const complete = async () => {
            try {
                // Clerk's third possible OAuth outcome: the identity resolves
                // to a session that's already active in this browser. Neither
                // signIn nor signUp reaches 'complete' in this case — Clerk
                // populates existingSession instead, and needs
                // clerk.setActive() rather than finalize() to activate it.
                const existingSessionId =
                    signIn.existingSession?.sessionId || signUp.existingSession?.sessionId;
                if (existingSessionId) {
                    await clerk.setActive({
                        session: existingSessionId,
                        navigate: () => router.push(getSsoCallbackUrl()),
                    });
                    return;
                }

                if (signIn.status === 'needs_second_factor') {
                    await startSecondFactor();
                    return;
                }

                if (signIn.status === 'complete') {
                    await signIn.finalize({ navigate: () => router.push(getSsoCallbackUrl()) });
                    return;
                }

                // Brand-new identity, no matching account yet.
                if (signIn.isTransferable) {
                    const { error: transferError } = await signUp.create({ transfer: true });
                    if (transferError) {
                        console.error('[sso-callback] transfer error', transferError);
                        setError('Could not create your account. Please try again.');
                        return;
                    }
                }

                if (signUp.status === 'complete') {
                    await signUp.finalize({ navigate: () => router.push(getSsoCallbackUrl()) });
                    return;
                }

                if (signUp.status === 'missing_requirements') {
                    console.error('[sso-callback] missing requirements', {
                        missingFields: signUp.missingFields,
                        unverifiedFields: signUp.unverifiedFields,
                    });
                    setError('More information is needed to finish signing up.');
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

    const handleVerifySecondFactor = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!signIn || !secondFactorStrategy) return;
        setError(null);
        setIsVerifying(true);

        try {
            let mfaError;

            if (secondFactorStrategy === 'totp') {
                ({ error: mfaError } = await signIn.mfa.verifyTOTP({ code: secondFactorCode }));
            } else if (secondFactorStrategy === 'phone_code') {
                ({ error: mfaError } = await signIn.mfa.verifyPhoneCode({ code: secondFactorCode }));
            } else {
                ({ error: mfaError } = await signIn.mfa.verifyBackupCode({ code: secondFactorCode }));
            }

            if (mfaError) throw mfaError;

            if (signIn.status === 'complete') {
                await signIn.finalize({ navigate: () => router.push(getSsoCallbackUrl()) });
                return;
            }

            setError('Unable to complete sign in. Please try again.');
        } catch (err) {
            console.error('[sso-callback] mfa verify error', err);
            setError('Incorrect code. Please try again.');
        } finally {
            setIsVerifying(false);
        }
    };

    const switchToBackupCode = () => {
        setError(null);
        setSecondFactorCode('');
        setSecondFactorStrategy('backup_code');
    };

    const switchBackToPrimaryFactor = () => {
        setError(null);
        setSecondFactorCode('');
        setSecondFactorStrategy(hasPhoneCodeOption ? 'phone_code' : 'totp');
    };

    // There's no standalone /sign-in route in this app — sign-in lives in a
    // modal controlled by useMcpStore. So instead of a plain link, this
    // opens that modal and sends the user home.
    const handleBackToSignIn = () => {
        // Keep the invite alive: /sign-in is a real route and reads redirect_url.
        const invite = getSsoRedirect();
        if (invite) {
            router.push(`/sign-in?redirect_url=${encodeURIComponent(invite)}`);
            return;
        }
        setSignInModalOpen(true);
        router.push('/');
    };

    if (needsSecondFactor) {
        const isBackupCode = secondFactorStrategy === 'backup_code';

        return (
            <div className="flex min-h-screen items-center justify-center">
                <div className="w-full max-w-lg mx-auto rounded-xl bg-background border border-border p-8">
                    <div className="text-center mb-6">
                        <h2 className="text-lg font-semibold text-foreground">Two-step verification</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {isBackupCode
                                ? 'Enter one of your backup codes'
                                : secondFactorStrategy === 'phone_code'
                                    ? 'Enter the code sent to your phone'
                                    : 'Enter the code from your authenticator app'}
                        </p>
                    </div>

                    <form onSubmit={handleVerifySecondFactor} className="flex flex-col gap-4">
                        <Input
                            type="text"
                            value={secondFactorCode}
                            onChange={(e) => setSecondFactorCode(e.target.value)}
                            placeholder={isBackupCode ? 'Backup code' : 'Enter 6-digit code'}
                            maxLength={isBackupCode ? undefined : 6}
                            className="h-12 text-center text-lg tracking-widest rounded-xl border-border bg-card text-foreground"
                        />

                        {error && <p className="text-sm text-destructive text-center">{error}</p>}

                        <Button
                            type="submit"
                            disabled={isVerifying || secondFactorCode.length === 0}
                            className="h-11 rounded-xl bg-foreground text-background font-medium hover:bg-foreground/90"
                        >
                            {isVerifying ? 'Verifying...' : 'Verify'}
                        </Button>
                    </form>

                    {hasBackupCodeOption && (
                        <div className="mt-4 text-center text-sm text-muted-foreground">
                            {isBackupCode ? (
                                <button
                                    type="button"
                                    onClick={switchBackToPrimaryFactor}
                                    className="font-medium text-[#E8A33D] hover:text-[#E8A33D]/80"
                                >
                                    {hasPhoneCodeOption ? 'Use your phone code instead' : 'Use your authenticator app instead'}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={switchToBackupCode}
                                    className="font-medium text-[#E8A33D] hover:text-[#E8A33D]/80"
                                >
                                    Use a backup code instead
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    }

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