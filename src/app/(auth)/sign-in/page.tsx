"use client";

import { useState } from "react";
import SignInForm from "../_components/SignInForm";
import SignUpForm from "../_components/SignUpForm";

// Standalone route the invite page redirects to: /sign-in?redirect_url=/invite/<id>
// The forms read `redirect_url` themselves (see lib/safe-redirect.ts).
export default function SignInPage() {
    const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");

    return (
        <div className="flex min-h-screen items-center justify-center px-4">
            <div className="w-full sm:max-w-xl">
                {mode === "sign-in" ? (
                    <SignInForm onSwitchToSignUp={() => setMode("sign-up")} />
                ) : (
                    <SignUpForm onSwitchToSignIn={() => setMode("sign-in")} />
                )}
            </div>
        </div>
    );
}