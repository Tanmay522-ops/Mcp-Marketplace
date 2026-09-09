'use client';

import { useSignIn, useUser } from '@clerk/nextjs';
import { isClerkAPIResponseError } from '@clerk/nextjs/errors';
import { OAuthStrategy } from '@clerk/types';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import GoogleIcon from '@/components/ui/GoogleIcon';
import { GitHubIcon } from '@/components/ui/GithubIcon';
import { useMcpStore } from '@/store/useMcpStore';

type SecondFactorStrategy = 'totp' | 'phone_code' | 'backup_code' | null;

export default function SignInForm() {
    const { signIn } = useSignIn();
    const { isSignedIn } = useUser();
    const router = useRouter();
    const { setSignInModalOpen, setSignUpModalOpen } = useMcpStore();

    const [emailAddress, setEmailAddress] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);

    // Set when Clerk's Client Trust feature requires an email-code check
    // for a password sign-in from a new/unrecognized device.
    const [needsTrustVerification, setNeedsTrustVerification] = useState(false);
    const [trustCode, setTrustCode] = useState('');

    // Set when the account has real MFA enabled (needs_second_factor).
    // secondFactorStrategy tracks which method we're currently collecting a
    // code for, so the same screen can offer "use a backup code instead".
    const [needsSecondFactor, setNeedsSecondFactor] = useState(false);
    const [secondFactorStrategy, setSecondFactorStrategy] = useState<SecondFactorStrategy>(null);
    const [secondFactorCode, setSecondFactorCode] = useState('');
    const [hasBackupCodeOption, setHasBackupCodeOption] = useState(false);
    const [hasPhoneCodeOption, setHasPhoneCodeOption] = useState(false);

    const [errors, setErrors] = useState<{
        email?: string;
        password?: string;
        general?: string;
    }>({});

    useEffect(() => {
        if (isSignedIn) {
            setSignInModalOpen(false);
            router.push('/callback');
        }
    }, [isSignedIn]);
    

    const handleClerkError = (err: unknown) => {
        if (isClerkAPIResponseError(err) && err.errors.length > 0) {
            err.errors.forEach((error) => {
                // Log the full error, not just unrecognized codes — this is
                // what lets us actually see `code`/`longMessage` instead of
                // guessing from a truncated message shown in the UI.
                console.error('[SignInForm] clerk error', {
                    code: error.code,
                    message: error.message,
                    longMessage: error.longMessage,
                    meta: error.meta,
                });

                switch (error.code) {
                    case 'form_password_incorrect':
                        setErrors((prev) => ({ ...prev, password: 'Incorrect password.' }));
                        break;
                    case 'form_identifier_not_found':
                        setErrors((prev) => ({ ...prev, email: 'No account found with this email.' }));
                        break;
                    case 'strategy_for_user_invalid':
                        setErrors((prev) => ({ ...prev, general: 'This account only supports Google Sign In.' }));
                        break;
                    case 'form_code_incorrect':
                        setErrors((prev) => ({ ...prev, general: 'Incorrect verification code.' }));
                        break;
                    case 'form_param_format_invalid':
                        if (error.meta?.paramName === 'identifier') {
                            setErrors((prev) => ({ ...prev, email: error.longMessage || 'Email address is invalid.' }));
                        } else {
                            setErrors((prev) => ({ ...prev, general: error.longMessage || error.message || 'Invalid input.' }));
                        }
                        break;
                    default:
                        // Prefer longMessage — Clerk's `message` field is
                        // often just a bare field-level tail (e.g. "is
                        // invalid") with no context on what it refers to.
                        setErrors((prev) => ({ ...prev, general: error.longMessage || error.message || 'Authentication failed.' }));
                }
            });
        } else {
            console.error('[SignInForm] unexpected error', err);
            setErrors({ general: 'An unexpected error occurred.' });
        }
    };

    // Runs after signIn.create()/password(), after a trust-verification code
    // is confirmed, or after a second-factor code is confirmed. Branches on
    // signIn.status the way Core 3 requires.
    const resolveSignInStatus = async () => {
        if (!signIn) return;

        if (signIn.status === 'complete') {
            await signIn.finalize({
                navigate: () => router.push('/callback'),
            });
            setSignInModalOpen(false);  
            toast.success('Login successful!');
            return;
        }

        if (signIn.status === 'needs_client_trust') {
            const emailCodeFactor = signIn.supportedSecondFactors?.find(
                (factor) => factor.strategy === 'email_code'
            );
            if (emailCodeFactor) {
                await signIn.mfa.sendEmailCode();
                setNeedsTrustVerification(true);
                return;
            }
            setErrors({ general: 'This device needs verification, but no verification method is available.' });
            return;
        }

        if (signIn.status === 'needs_second_factor') {
            const factors = signIn.supportedSecondFactors ?? [];
            const totpFactor = factors.find((f) => f.strategy === 'totp');
            const phoneFactor = factors.find((f) => f.strategy === 'phone_code');
            const backupFactor = factors.find((f) => f.strategy === 'backup_code');

            setHasBackupCodeOption(!!backupFactor);
            setHasPhoneCodeOption(!!phoneFactor);

            // Prefer TOTP (no code to send, user reads it off their
            // authenticator app) — fall back to SMS if that's all this
            // account has enabled.
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
                    handleClerkError(err);
                }
                return;
            }

            if (backupFactor) {
                setSecondFactorStrategy('backup_code');
                setNeedsSecondFactor(true);
                return;
            }

            setErrors({ general: 'Two-factor verification is required, but no supported method was found.' });
            return;
        }

        setErrors({ general: 'Unable to complete sign in. Please try again.' });
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!signIn) return;
        setErrors({});
        setIsLoading(true);

        try {
            const { error: createError } = await signIn.create({ identifier: emailAddress });
            if (createError) throw createError;

            const { error: passwordError } = await signIn.password({ password });
            if (passwordError) throw passwordError;

            await resolveSignInStatus();
        } catch (err) {
            handleClerkError(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleVerifyTrust = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!signIn) return;
        setErrors({});
        setIsVerifying(true);

        try {
            const { error } = await signIn.mfa.verifyEmailCode({ code: trustCode });
            if (error) throw error;
            await resolveSignInStatus();
        } catch (err) {
            handleClerkError(err);
        } finally {
            setIsVerifying(false);
        }
    };

    const handleVerifySecondFactor = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!signIn || !secondFactorStrategy) return;
        setErrors({});
        setIsVerifying(true);

        try {
            let error;

            if (secondFactorStrategy === 'totp') {
                ({ error } = await signIn.mfa.verifyTOTP({ code: secondFactorCode }));
            } else if (secondFactorStrategy === 'phone_code') {
                ({ error } = await signIn.mfa.verifyPhoneCode({ code: secondFactorCode }));
            } else {
                ({ error } = await signIn.mfa.verifyBackupCode({ code: secondFactorCode }));
            }

            if (error) throw error;
            await resolveSignInStatus();
        } catch (err) {
            handleClerkError(err);
        } finally {
            setIsVerifying(false);
        }
    };

    const switchToBackupCode = () => {
        setErrors({});
        setSecondFactorCode('');
        setSecondFactorStrategy('backup_code');
    };

    const switchBackToPrimaryFactor = () => {
        setErrors({});
        setSecondFactorCode('');
        setSecondFactorStrategy(hasPhoneCodeOption ? 'phone_code' : 'totp');
    };

    const signInWith = async (strategy: OAuthStrategy) => {
        try {
            if (!signIn) return;
            const { error } = await signIn.sso({
                strategy,
                redirectCallbackUrl: '/sso-callback',
                redirectUrl: '/callback',
            });
            if (error) {
                console.error('[signInWith] sso() returned error', error);
                setErrors({ general: 'Could not start sign in. Please try again.' });
            }
        } catch (err) {
            console.error('[signInWith] threw', err);
            setErrors({ general: 'Could not start sign in. Please try again.' });
        }
    };

    if (needsSecondFactor) {
        const isBackupCode = secondFactorStrategy === 'backup_code';

        return (
            <div className="w-full max-w-lg mx-auto rounded-xl bg-background border border-border p-8 relative">
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

                    {errors.general && <p className="text-sm text-destructive text-center">{errors.general}</p>}

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
        );
    }

    if (needsTrustVerification) {
        return (
            <div className="w-full max-w-lg mx-auto rounded-xl bg-background border border-border p-8 relative">
                <div className="text-center mb-6">
                    <h2 className="text-lg font-semibold text-foreground">Verify this device</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Enter the verification code sent to your email
                    </p>
                </div>

                <form onSubmit={handleVerifyTrust} className="flex flex-col gap-4">
                    <Input
                        type="text"
                        value={trustCode}
                        onChange={(e) => setTrustCode(e.target.value)}
                        placeholder="Enter 6-digit code"
                        maxLength={6}
                        className="h-12 text-center text-lg tracking-widest rounded-xl border-border bg-card text-foreground"
                    />

                    {errors.general && <p className="text-sm text-destructive text-center">{errors.general}</p>}

                    <Button
                        type="submit"
                        disabled={isVerifying || trustCode.length !== 6}
                        className="h-11 rounded-xl bg-foreground text-background font-medium hover:bg-foreground/90"
                    >
                        {isVerifying ? 'Verifying...' : 'Verify'}
                    </Button>
                </form>
            </div>
        );
    }

    return (
        <div className="w-full max-w-lg mx-auto rounded-xl bg-background border border-border p-8 relative">
            <div className="mb-6">
                <h2 className="text-2xl font-semibold text-foreground">Welcome back</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    Sign in to browse and publish MCP tools.
                </p>
            </div>

            <div className="flex flex-col gap-3 mb-6">
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => signInWith('oauth_google')}
                    className="h-11 rounded-lg border-border bg-card text-foreground hover:bg-accent"
                >
                    <GoogleIcon />
                    Continue with Google
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => signInWith('oauth_github')}
                    className="h-11 rounded-lg border-border bg-card text-foreground hover:bg-accent"
                >
                    <GitHubIcon className="size-4" />
                    Continue with GitHub
                </Button>
            </div>

            <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs">
                    <span className="bg-background px-2 text-muted-foreground uppercase">Or</span>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                <div className="space-y-2">
                    <Label className="text-sm font-medium text-foreground">Email</Label>
                    <Input
                        type="email"
                        placeholder="you@example.com"
                        required
                        value={emailAddress}
                        onChange={(e) => setEmailAddress(e.target.value)}
                        className="h-11 rounded-lg border-border bg-card text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-[#E8A33D] focus-visible:border-[#E8A33D]"
                    />
                    {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
                </div>

                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium text-foreground">Password</Label>
                        <a href="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground">
                            Forgot?
                        </a>
                    </div>
                    <Input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="h-11 rounded-lg border-border bg-card text-foreground focus-visible:ring-1 focus-visible:ring-[#E8A33D] focus-visible:border-[#E8A33D]"
                    />
                    {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
                </div>

                {errors.general && (
                    <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                        {errors.general}
                    </div>
                )}

                <Button
                    type="submit"
                    disabled={isLoading}
                    className="h-11 rounded-lg bg-foreground text-background font-medium hover:bg-foreground/90"
                >
                    {isLoading ? 'Signing in...' : 'Sign in'}
                </Button>
            </form>

            <div className="mt-6 text-center text-sm text-muted-foreground">
                No account?{' '}
                <button
                    type="button"
                    onClick={() => {
                        setSignInModalOpen(false);
                        setSignUpModalOpen(true);
                    }}
                    className="font-medium text-[#E8A33D] hover:text-[#E8A33D]/80"
                >
                    Start free trial
                </button>
            </div>
        </div>
    );
}