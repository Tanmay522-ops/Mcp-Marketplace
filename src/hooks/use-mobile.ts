import * as React from "react"

const MOBILE_BREAKPOINT = 768

// Rebuilt on useSyncExternalStore instead of useState+useEffect — this
// is the case that hook exists for: reading a value from a browser API
// (window.innerWidth) that doesn't exist during SSR, and staying in
// sync with it afterward. The old version had to reach for setState
// inside the effect just to set the correct INITIAL value once mounted
// (window isn't available at first render), which is exactly the
// pattern react-hooks/set-state-in-effect flags. useSyncExternalStore
// handles both the subscription and the SSR-safe initial value natively.
const subscribe = (callback: () => void) => {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener("change", callback)
  return () => mql.removeEventListener("change", callback)
}

const getSnapshot = () => window.innerWidth < MOBILE_BREAKPOINT
const getServerSnapshot = () => false // no viewport during SSR — matches the old default (isMobile undefined -> !!undefined -> false)

export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}