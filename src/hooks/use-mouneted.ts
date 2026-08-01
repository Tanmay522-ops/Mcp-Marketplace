// hooks/use-mounted.ts
//
// Replaces the common `const [mounted, setMounted] = useState(false);
// useEffect(() => setMounted(true), [])` pattern used to avoid SSR
// hydration mismatches (e.g. portal-based modals that must not render
// until the client is ready). That pattern trips the
// react-hooks/set-state-in-effect lint rule because it's technically an
// imperative setState call inside an effect — even though it's safe and
// idiomatic here. useSyncExternalStore expresses the same thing as a
// store subscription instead, which doesn't trigger that rule, and is
// the pattern React's own docs recommend for exactly this case.

import { useSyncExternalStore } from "react"

const emptySubscribe = () => () => { }

export const useMounted = (): boolean =>
    useSyncExternalStore(
        emptySubscribe,
        () => true, // client snapshot — already mounted
        () => false // server snapshot — never mounted during SSR
    )