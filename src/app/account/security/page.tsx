'use client';

import { useState, useEffect } from 'react';
import { useUser, useReverification } from '@clerk/nextjs';
import { isClerkAPIResponseError } from '@clerk/nextjs/errors';
import type { PhoneNumberResource } from '@clerk/nextjs/types';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

type Step = 'list' | 'add-phone' | 'verify-phone';

export default function SecuritySettingsPage() {
    const { isLoaded, isSignedIn, user } = useUser();

    const [step, setStep] = useState<Step>('list');
    const [phone, setPhone] = useState('');
    const [code, setCode] = useState('');
    const [pendingPhoneId, setPendingPhoneId] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Reverification is required for these — Clerk forces a fresh
    // sign-in check before letting a user touch security-sensitive
    // account settings like adding a phone number or enabling MFA.
    const createPhoneNumber = useReverification((phoneNumber: string) =>
        user?.createPhoneNumber({ phoneNumber })
    );
    const reservePhoneForMfa = useReverification((phoneObj: PhoneNumberResource) =>
        phoneObj.setReservedForSecondFactor({ reserved: true })
    );
    const removePhoneForMfa = useReverification((phoneObj: PhoneNumberResource) =>
        phoneObj.setReservedForSecondFactor({ reserved: false })
    );
    const destroyPhone = useReverification((phoneObj: PhoneNumberResource) =>
        phoneObj.destroy()
    );

    const handleClerkError = (err: unknown, fallback: string) => {
        if (isClerkAPIResponseError(err) && err.errors.length > 0) {
            const e = err.errors[0];
            console.error('[SecuritySettings] clerk error', {
                code: e.code,
                message: e.message,
                longMessage: e.longMessage,
            });
            setError(e.longMessage || e.message || fallback);
        } else {
            console.error('[SecuritySettings] unexpected error', err);
            setError(fallback);
        }
    };

    if (!isLoaded) {
        return <p className="text-sm text-muted-foreground">Loading...</p>;
    }

    if (!isSignedIn) {
        return <p className="text-sm text-muted-foreground">You must be signed in to access this page.</p>;
    }

    const mfaPhones = user.phoneNumbers
        .filter((p) => p.verification.status === 'verified')
        .filter((p) => p.reservedForSecondFactor);

    const handleAddPhone = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        setIsSubmitting(true);

        try {
            const res = await createPhoneNumber(phone);
            await user.reload();

            const phoneObj = user.phoneNumbers.find((p) => p.id === res?.id);
            if (!phoneObj) {
                setError('Could not find the phone number that was just added. Please try again.');
                return;
            }

            await phoneObj.prepareVerification();
            setPendingPhoneId(phoneObj.id);
            setStep('verify-phone');
        } catch (err) {
            handleClerkError(err, 'Could not add phone number. Please check the format and try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleVerifyPhone = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        setIsSubmitting(true);

        try {
            const phoneObj = user.phoneNumbers.find((p) => p.id === pendingPhoneId);
            if (!phoneObj) {
                setError('Something went wrong. Please start over.');
                setStep('add-phone');
                return;
            }

            const result = await phoneObj.attemptVerification({ code });

            if (result.verification.status !== 'verified') {
                setError('Incorrect code. Please try again.');
                return;
            }

            // Verifying the phone number isn't enough on its own — it has to
            // be explicitly reserved as a second factor, or Clerk will treat
            // it as just a contact phone number, not an MFA method.
            await reservePhoneForMfa(phoneObj);
            await user.reload();

            setCode('');
            setPhone('');
            setPendingPhoneId(null);
            setStep('list');
        } catch (err) {
            handleClerkError(err, 'Verification failed. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDisableMfa = async (phoneObj: PhoneNumberResource) => {
        setError(null);
        try {
            await removePhoneForMfa(phoneObj);
            await user.reload();
        } catch (err) {
            handleClerkError(err, 'Could not disable two-factor authentication.');
        }
    };

    const handleRemovePhone = async (phoneObj: PhoneNumberResource) => {
        setError(null);
        try {
            await destroyPhone(phoneObj);
            await user.reload();
        } catch (err) {
            handleClerkError(err, 'Could not remove this phone number.');
        }
    };

    if (step === 'verify-phone') {
        return (
            <div className="w-full max-w-lg mx-auto rounded-xl bg-background border border-border p-8">
                <div className="text-center mb-6">
                    <h2 className="text-lg font-semibold text-foreground">Verify your phone</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Enter the code we texted to {phone}
                    </p>
                </div>

                <form onSubmit={handleVerifyPhone} className="flex flex-col gap-4">
                    <Input
                        type="text"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="Enter 6-digit code"
                        maxLength={6}
                        className="h-12 text-center text-lg tracking-widest rounded-xl border-border bg-card text-foreground"
                    />

                    {error && <p className="text-sm text-destructive text-center">{error}</p>}

                    <Button
                        type="submit"
                        disabled={isSubmitting || code.length !== 6}
                        className="h-11 rounded-xl bg-foreground text-background font-medium hover:bg-foreground/90"
                    >
                        {isSubmitting ? 'Verifying...' : 'Verify & enable 2FA'}
                    </Button>

                    <button
                        type="button"
                        onClick={() => {
                            setStep('add-phone');
                            setError(null);
                        }}
                        className="text-sm text-muted-foreground hover:text-foreground underline"
                    >
                        Use a different number
                    </button>
                </form>
            </div>
        );
    }

    if (step === 'add-phone') {
        return (
            <div className="w-full max-w-lg mx-auto rounded-xl bg-background border border-border p-8">
                <div className="text-center mb-6">
                    <h2 className="text-lg font-semibold text-foreground">Add a phone number</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        We'll text you a code each time you sign in.
                    </p>
                </div>

                <form onSubmit={handleAddPhone} className="flex flex-col gap-4">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-foreground">Phone number</Label>
                        <Input
                            type="tel"
                            placeholder="+1 555 123 4567"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="h-11 rounded-xl border-border bg-card text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-[#E8A33D] focus-visible:border-[#E8A33D]"
                        />
                        <p className="text-xs text-muted-foreground">
                            Include your country code, e.g. +1 for the US.
                        </p>
                    </div>

                    {error && <p className="text-sm text-destructive">{error}</p>}

                    <Button
                        type="submit"
                        disabled={isSubmitting || !phone.trim()}
                        className="h-11 rounded-xl bg-foreground text-background font-medium hover:bg-foreground/90"
                    >
                        {isSubmitting ? 'Sending code...' : 'Send verification code'}
                    </Button>

                    <button
                        type="button"
                        onClick={() => {
                            setStep('list');
                            setError(null);
                        }}
                        className="text-sm text-muted-foreground hover:text-foreground underline"
                    >
                        Cancel
                    </button>
                </form>
            </div>
        );
    }

    return (
        <div className="w-full max-w-lg mx-auto rounded-xl bg-background border border-border p-8">
            <h2 className="text-lg font-semibold text-foreground mb-1">Two-factor authentication</h2>
            <p className="text-sm text-muted-foreground mb-6">
                Add an extra layer of security to your account with a text-message code at sign-in.
            </p>

            {error && <p className="text-sm text-destructive mb-4">{error}</p>}

            {mfaPhones.length === 0 ? (
                <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground mb-4">
                    Two-factor authentication is currently off for your account.
                </div>
            ) : (
                <ul className="flex flex-col gap-3 mb-4">
                    {mfaPhones.map((phoneObj) => (
                        <li
                            key={phoneObj.id}
                            className="flex items-center justify-between rounded-lg border border-border bg-card p-4"
                        >
                            <span className="text-sm text-foreground">{phoneObj.phoneNumber}</span>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => handleDisableMfa(phoneObj)}
                                    className="text-sm text-muted-foreground hover:text-foreground underline"
                                >
                                    Turn off
                                </button>
                                <button
                                    onClick={() => handleRemovePhone(phoneObj)}
                                    className="text-sm text-destructive hover:text-destructive/80 underline"
                                >
                                    Remove
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            <Button
                type="button"
                onClick={() => setStep('add-phone')}
                className="h-11 rounded-xl bg-foreground text-background font-medium hover:bg-foreground/90"
            >
                {mfaPhones.length === 0 ? 'Turn on two-factor authentication' : 'Add another phone number'}
            </Button>
        </div>
    );
}