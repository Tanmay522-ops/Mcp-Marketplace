'use client';

import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useMcpStore } from '@/store/useMcpStore';
import SignUpForm from './SignUpForm';

export function SignUpModal() {
    const { isSignUpModalOpen, setSignUpModalOpen } = useMcpStore();

    return (
        <>
            <Button
                onClick={() => setSignUpModalOpen(true)}
                className="bg-white text-black hover:bg-white/90"
            >
                Sign Up
            </Button>

            <Dialog open={isSignUpModalOpen} onOpenChange={setSignUpModalOpen}>
                <DialogContent
                    showCloseButton={false}
                    className="sm:max-w-xl p-0 border-none !bg-transparent shadow-none ring-0"
                >
                    <SignUpForm onClose={() => setSignUpModalOpen(false)} />
                </DialogContent>
            </Dialog>
        </>
    );
}