'use client';

import { useSignUp } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { X } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { OAuthStrategy } from '@clerk/types';
import GoogleIcon from '@/components/ui/GoogleIcon';
import { GitHubIcon } from '@/components/ui/GithubIcon';

export default function SignUpForm({ onClose }: { onClose?: () => void }) {
    const { signUp } = useSignUp();
    const router = useRouter();

    const [emailAddress, setEmailAddress] = useState('');
    const [password, setPassword] = useState('');

    const [verifying, setVerifying] = useState(false);
    const [code, setCode] = useState('');

    const [isLoading, setIsLoading] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');

    const [errors, setErrors] = useState<{
        name?: string;
        email?: string;
        password?: string;
        general?: string;
    }>({});

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
            } as any);

            if (result.error) throw result.error;

            const verificationResult = await signUp.verifications.sendEmailCode();
            if (verificationResult.error) throw verificationResult.error;

            setVerifying(true);
        } catch (err: any) {
            if (err.errors?.length > 0) {
                err.errors.forEach((error: any) => {
                    switch (error.code) {
                        case 'form_password_length_too_short':
                            setErrors((prev) => ({ ...prev, password: 'Password must be at least 8 characters.' }));
                            break;
                        case 'form_password_pwned':
                            setErrors((prev) => ({ ...prev, password: 'Password is too weak.' }));
                            break;
                        case 'form_identifier_exists':
                            setErrors((prev) => ({ ...prev, email: 'Email already exists.' }));
                            break;
                        default:
                            setErrors((prev) => ({ ...prev, general: error.message || 'Authentication failed' }));
                    }
                });
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

            const finalizeResult = await signUp.finalize();
            if (finalizeResult.error) throw finalizeResult.error;

            router.push('/callback');
        } catch (err: any) {
            if (err.errors?.length > 0) {
                err.errors.forEach((error: any) => {
                    switch (error.code) {
                        case 'form_code_incorrect':
                            setErrors((prev) => ({ ...prev, general: 'Incorrect verification code' }));
                            break;
                        default:
                            setErrors((prev) => ({ ...prev, general: error.message || 'Verification failed' }));
                    }
                });
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

    const signUpWith = async (
        strategy: OAuthStrategy
    ) => {
        if (!signUp) return;

        try {
            await signUp.sso({
                strategy,
                redirectUrl: "/callback",
                redirectCallbackUrl: "/callback",
            });
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div className="w-full max-w-lg mx-auto rounded-xl bg-background border border-border p-8 relative">
            {onClose && (
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
                >
                    <X className="size-4" />
                </button>
            )}

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
                                onClick={() => signUpWith("oauth_github")}
                                className="h-11 rounded-xl border-border bg-card text-foreground hover:bg-accent"
                            >
                                <GitHubIcon className="mr-2 h-4 w-4" />
                                Continue with GitHub
                            </Button>

                        <p className="text-center text-xs text-muted-foreground mt-1">
                            By signing up you agree to our{' '}
                            <a href="/terms" className="underline hover:text-foreground">
                                Terms
                            </a>
                            .
                        </p>
                    </form>
                </>
            )}
        </div>
    );
}