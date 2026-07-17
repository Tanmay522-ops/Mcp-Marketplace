'use client';

import { useClerk, useSignIn } from '@clerk/nextjs';
import { OAuthStrategy } from '@clerk/types';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';


import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import GoogleIcon from '@/components/ui/GoogleIcon';
import { GitHubIcon } from '@/components/ui/GithubIcon';


export default function SignInForm() {
    const { signIn } = useSignIn();
    const { signOut } = useClerk();

    const router = useRouter();

    const [emailAddress, setEmailAddress] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [errors, setErrors] = useState<{
        email?: string;
        password?: string;
        general?: string;
    }>({});

    // ← removed the if (!loaded || !signIn) return null

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!signIn) return; // ← guard moved here instead
        setErrors({});
        setIsLoading(true);

        try {
            const { error } = await signIn.create({
                identifier: emailAddress,
                password,
            });

            if (error) throw error;

            toast.success('Login successful!');
            router.push('/callback');
        } catch (err: any) {
            console.error(err);
            if (err.errors?.length > 0) {
                err.errors.forEach((error: any) => {
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
                        default:
                            setErrors((prev) => ({ ...prev, general: error.message || 'Authentication failed.' }));
                    }
                });
            } else {
                setErrors({ general: 'An unexpected error occurred.' });
            }
        } finally {
            setIsLoading(false);
        }
    };

    const signInWith = async (strategy: OAuthStrategy) => {
        try {
            if (!signIn) return;
            await signOut();
            await signIn.sso({
                strategy,
                redirectUrl: '/callback',
                redirectCallbackUrl: '/callback',
            });
        } catch (err: any) {
            console.error(err);
        }
    };

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
                    Sign in
                </Button>
            </form>

            <div className="mt-6 text-center text-sm text-muted-foreground">
                No account?{' '}
                <a href="/sign-up" className="font-medium text-[#E8A33D] hover:text-[#E8A33D]/80">
                    Start free trial
                </a>
            </div>
        </div>
    );
}