// lib/safe-equal.ts
//
// crypto.timingSafeEqual requires equal-length buffers (it throws
// otherwise), and lengths aren't secret — so checking length first and
// short-circuiting is safe and doesn't leak anything a plain `!==` on
// the strings wouldn't already leak. What timingSafeEqual actually
// protects is the byte-by-byte comparison itself: a plain `===`/`!==`
// on two strings can return in a different amount of time depending on
// how many leading bytes matched, which is (in theory) enough of a
// signal for an attacker to guess a valid signature one byte at a time
// across many requests. This closes that specific gap.

import { timingSafeEqual } from "crypto"

export const safeEqual = (a: string, b: string): boolean => {
    const bufA = Buffer.from(a)
    const bufB = Buffer.from(b)
    if (bufA.length !== bufB.length) return false
    return timingSafeEqual(bufA, bufB)
}