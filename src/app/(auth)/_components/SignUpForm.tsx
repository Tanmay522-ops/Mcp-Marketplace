'use client';

import { useSignIn, useSignUp, useUser } from '@clerk/nextjs';
import { isClerkAPIResponseError } from '@clerk/nextjs/errors';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { OAuthStrategy } from '@clerk/types';
import GoogleIcon from '@/components/ui/GoogleIcon';
import { GitHubIcon } from '@/components/ui/GithubIcon';
import { useMcpStore } from '@/store/useMcpStore';
import { toast } from 'sonner';

export default function SignUpForm() {
    const { setSignInModalOpen, setSignUpModalOpen } = useMcpStore();
    const { signUp } = useSignUp();
    const { signIn } = useSignIn();
    const { isSignedIn } = useUser();
    const router = useRouter();

    const [emailAddress, setEmailAddress] = useState('');
    const [password, setPassword] = useState('');

    const [verifying, setVerifying] = useState(false);
    const [code, setCode] = useState('');

    const [isLoading, setIsLoading] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');

    const [errors, setErrors] = useState<{
        email?: string;
        password?: string;
        general?: string;
    }>({});

    useEffect(() => {
        if (isSignedIn) {
            setSignUpModalOpen(false);
            router.push('/callback');
        }
    }, [isSignedIn]);

    const validateForm = () => {
        const newErrors: typeof errors = {};

        if (!emailAddress.trim()) newErrors.email = 'Email is required.';
        if (!password) {
            newErrors.password = 'Password is required.';
        } else if (password.length < 8) {
            newErrors.password = 'Password must be at least 8 characters.';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!signUp) return;
        if (!validateForm()) return;

        try {
            setIsLoading(true);
            setErrors({});

            const result = await signUp.password({
                emailAddress,
                password,
            });

            if (result.error) throw result.error;

            const verificationResult = await signUp.verifications.sendEmailCode();
            if (verificationResult.error) throw verificationResult.error;

            setVerifying(true);
        } catch (err) {
            if (isClerkAPIResponseError(err) && err.errors.length > 0) {
                err.errors.forEach((error) => {
                    // Log every Clerk error here, not just unrecognized ones —
                    // this is the only way to see the real `code` and
                    // `longMessage` Clerk sent, since the UI was showing a
                    // truncated "is invalid" with no way to tell why.
                    console.error('[handleSubmit] clerk error', {
                        code: error.code,
                        message: error.message,
                        longMessage: error.longMessage,
                        meta: error.meta,
                    });

                    switch (error.code) {
                        case 'form_password_length_too_short':
                            setErrors((prev) => ({ ...prev, password: 'Password must be at least 8 characters.' }));
                            break;
                        case 'form_password_pwned':
                            setErrors((prev) => ({ ...prev, password: 'This password has appeared in a data breach — please choose a different one.' }));
                            break;
                        case 'form_password_not_strong_enough':
                            setErrors((prev) => ({ ...prev, password: error.longMessage || 'Password is not strong enough.' }));
                            break;
                        case 'form_password_size_in_bytes_exceeded':
                            setErrors((prev) => ({ ...prev, password: 'Password is too long.' }));
                            break;
                        case 'form_identifier_exists':
                            setErrors((prev) => ({ ...prev, email: 'Email already exists.' }));
                            break;
                        case 'form_param_format_invalid':
                            // Clerk attaches this to whichever field failed
                            // format validation — meta.paramName tells us
                            // which one so we don't have to guess.
                            if (error.meta?.paramName === 'email_address') {
                                setErrors((prev) => ({ ...prev, email: error.longMessage || 'Email address is invalid.' }));
                            } else if (error.meta?.paramName === 'password') {
                                setErrors((prev) => ({ ...prev, password: error.longMessage || 'Password is invalid.' }));
                            } else {
                                setErrors((prev) => ({ ...prev, general: error.longMessage || error.message || 'Invalid input.' }));
                            }
                            break;
                        default:
                            // Prefer longMessage — Clerk's `message` field is
                            // often just the field-level tail (e.g. "is
                            // invalid") with no context on what "is" refers
                            // to, which is exactly what was showing up here.
                            setErrors((prev) => ({ ...prev, general: error.longMessage || error.message || 'Authentication failed' }));
                    }
                });
            } else {
                console.error('[handleSubmit] unexpected error', err);
                setErrors({ general: 'An unexpected error occurred. Please try again.' });
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleVerify = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!signUp) return;

        try {
            setIsVerifying(true);
            const verifyResult = await signUp.verifications.verifyEmailCode({ code });
            if (verifyResult.error) throw verifyResult.error;

            if (signUp.status !== 'complete') {
                setErrors({ general: 'Additional information is needed to finish signing up.' });
                return;
            }

            const finalizeResult = await signUp.finalize({
                navigate: () => router.push('/callback'),
            });

            if (finalizeResult?.error) throw finalizeResult.error;

            toast.success('SignUp successful!');
            return;
        } catch (err) {
            if (isClerkAPIResponseError(err) && err.errors.length > 0) {
                err.errors.forEach((error) => {
                    console.error('[handleVerify] clerk error', {
                        code: error.code,
                        message: error.message,
                        longMessage: error.longMessage,
                    });
                    switch (error.code) {
                        case 'form_code_incorrect':
                            setErrors((prev) => ({ ...prev, general: 'Incorrect verification code' }));
                            break;
                        default:
                            setErrors((prev) => ({ ...prev, general: error.longMessage || error.message || 'Verification failed' }));
                    }
                });
            } else {
                console.error('[handleVerify] unexpected error', err);
                setErrors({ general: 'An unexpected error occurred. Please try again.' });
            }
        } finally {
            setIsVerifying(false);
        }
    };

    const handleResendCode = async () => {
        if (!signUp) return;
        try {
            const resendResult = await signUp.verifications.sendEmailCode();
            if (resendResult.error) throw resendResult.error;
            setSuccessMessage('Verification code resent');
        } catch {
            setErrors({ general: 'Failed to resend verification code.' });
        }
    };

    const signUpWith = async (strategy: OAuthStrategy) => {
        if (!signIn) return;

        try {
            // Deliberately signIn.sso() here, not signUp.sso() — this is
            // Clerk's documented combined sign-in-or-up pattern. It's what
            // lets /sso-callback's signIn.isTransferable check actually
            // detect "this is a brand-new user" and create the sign-up via
            // transfer.
            const { error } = await signIn.sso({
                strategy,
                redirectCallbackUrl: '/sso-callback',
                redirectUrl: '/callback',
            });

            if (error) {
                console.error('[signUpWith] sso() returned error', error);
                setErrors({ general: 'Could not sign up with this provider. Please try again.' });
            }
        } catch (err) {
            console.error('[signUpWith] threw', err);
            setErrors({ general: 'Could not sign up with this provider. Please try again.' });
        }
    };


    const switchToSignIn = () => {
        setSignUpModalOpen(false);
        setSignInModalOpen(true);
    };


    return (
        <div className="w-full max-w-lg mx-auto rounded-xl bg-background border border-border p-8 relative">
            
            {verifying ? (
                <>
                    <div className="text-center mb-6">
                        <h2 className="text-lg font-semibold text-foreground">Verify your email</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Enter the verification code sent to your email
                        </p>
                    </div>

                    <form onSubmit={handleVerify} className="flex flex-col gap-4">
                        <Input
                            type="text"
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            placeholder="Enter 6-digit code"
                            maxLength={6}
                            className="h-12 text-center text-lg tracking-widest rounded-xl border-border bg-card text-foreground"
                        />

                        {errors.general && <p className="text-sm text-destructive text-center">{errors.general}</p>}
                        {successMessage && <p className="text-sm text-green-500 text-center">{successMessage}</p>}

                        <Button
                            type="submit"
                            disabled={isVerifying || code.length !== 6}
                            className="h-11 rounded-xl bg-foreground text-background font-medium hover:bg-foreground/90"
                        >
                            {isVerifying ? 'Verifying...' : 'Verify'}
                        </Button>
                    </form>

                    <div className="mt-4 text-center text-sm text-muted-foreground">
                        Didn't receive the code?{' '}
                        <button
                            type="button"
                            onClick={handleResendCode}
                            className="font-medium text-[#E8A33D] hover:text-[#E8A33D]/80"
                        >
                            Resend code
                        </button>
                    </div>
                </>
            ) : (
                <>
                    <div className="flex flex-col items-center text-center mb-6">
                        <div className="size-14 rounded-full bg-card border border-border flex items-center justify-center mb-3 overflow-hidden">
                            <div className="size-6 rounded-sm bg-[#E8A33D] rotate-45" />
                        </div>
                        <h2 className="text-lg font-semibold text-foreground">Sign up to MCP Registry</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            We just need a few details to get you started.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                        <div className="space-y-2">
                            <Label className="text-sm font-medium text-foreground">Email</Label>
                            <Input
                                type="email"
                                placeholder="you@example.com"
                                value={emailAddress}
                                onChange={(e) => setEmailAddress(e.target.value)}
                                className="h-11 rounded-xl border-border bg-card text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-[#E8A33D] focus-visible:border-[#E8A33D]"
                            />
                            {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
                        </div>

                        <div className="space-y-2">
                            <Label className="text-sm font-medium text-foreground">Password</Label>
                            <Input
                                type="password"
                                placeholder="Enter your password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="h-11 rounded-xl border-border bg-card text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-[#E8A33D] focus-visible:border-[#E8A33D]"
                            />
                            {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
                        </div>

                        {errors.general && <p className="text-sm text-destructive">{errors.general}</p>}

                        <div id="clerk-captcha" />

                        <Button
                            type="submit"
                            disabled={isLoading}
                            className="h-11 rounded-xl bg-foreground text-background font-medium hover:bg-foreground/90"
                        >
                            {isLoading ? 'Signing up...' : 'Sign up'}
                        </Button>

                        <div className="relative my-1">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t border-border" />
                            </div>
                            <div className="relative flex justify-center text-xs">
                                <span className="bg-background px-2 text-muted-foreground uppercase">Or</span>
                            </div>
                        </div>

                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => signUpWith('oauth_google')}
                            className="h-11 rounded-xl border-border bg-card text-foreground hover:bg-accent"
                        >
                            <GoogleIcon />
                            Continue with Google
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => signUpWith('oauth_github')}
                            className="h-11 rounded-xl border-border bg-card text-foreground hover:bg-accent"
                        >
                            <GitHubIcon className="mr-2 h-4 w-4" />
                            Continue with GitHub
                        </Button>

                            <div className="mt-2 text-center text-sm text-muted-foreground">
                                Already have an account?{' '}
                                <button
                                    type="button"
                                    onClick={switchToSignIn}
                                    className="font-medium text-[#E8A33D] hover:text-[#E8A33D]/80"
                                >
                                    Sign in
                                </button>
                            </div>
                    </form>
                </>
            )}
        </div>
    );
}