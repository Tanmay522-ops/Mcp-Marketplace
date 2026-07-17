import { create } from 'zustand'

type McpStore = {
    isSignInModalOpen: boolean
    isSignUpModalOpen: boolean
    isComplete: boolean
    isSubmitting: boolean

    setSignInModalOpen: (open: boolean) => void
    setSignUpModalOpen: (open: boolean) => void
    setComplete: (complete: boolean) => void
    setSubmitting: (submitting: boolean) => void
}

export const useMcpStore = create<McpStore>((set) => ({
    isSignInModalOpen: false,
    isSignUpModalOpen: false,
    isComplete: false,
    isSubmitting: false,

    setSignInModalOpen: (open: boolean) =>
        set({ isSignInModalOpen: open }),

    setSignUpModalOpen: (open: boolean) =>
        set({ isSignUpModalOpen: open }),

    setComplete: (complete: boolean) =>
        set({ isComplete: complete }),

    setSubmitting: (submitting: boolean) =>
        set({ isSubmitting: submitting }),
}))