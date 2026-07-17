'use client';

import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useMcpStore } from '@/store/useMcpStore';
import SignInForm from './SignInForm';

export function SignInModal() {
    const { isSignInModalOpen, setSignInModalOpen } = useMcpStore();

    return (
        <>
            <Button
                variant="outline"
                onClick={() => setSignInModalOpen(true)}
                className="hover:bg-background border-grey cursor-pointer"
            >
                Sign In
            </Button>

            <Dialog open={isSignInModalOpen} onOpenChange={setSignInModalOpen}>
                <DialogContent
                    showCloseButton={false}
                    className="sm:max-w-xl p-0 border-none !bg-transparent shadow-none ring-0"
                >
                    <SignInForm/>
                </DialogContent>
            </Dialog>
        </>
    );
}