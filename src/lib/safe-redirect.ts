/**
 * Invite-flow redirect helpers.
 *
 * Only `/invite/<id>` paths are ever accepted, which blocks open redirects
 * (`?redirect_url=https://evil.com` is simply ignored).
 *
 * All functions that touch `window` must run in the browser (effects and
 * event handlers), which is where every caller uses them.
 */

const INVITE_PATH = /^\/invite\/[\w-]+$/;
const STORAGE_KEY = "auth:redirect_url";

/** Returns the value only if it is a safe `/invite/<id>` path, else null. */
export function sanitizeRedirect(raw: string | null | undefined): string | null {
    if (typeof raw !== "string") return null;
    return INVITE_PATH.test(raw) ? raw : null;
}

function readFromUrl(): string | null {
    if (typeof window === "undefined") return null;
    return sanitizeRedirect(new URLSearchParams(window.location.search).get("redirect_url"));
}

function readFromStorage(): string | null {
    if (typeof window === "undefined") return null;
    try {
        return sanitizeRedirect(window.sessionStorage.getItem(STORAGE_KEY));
    } catch {
        return null;
    }
}

/**
 * Call right before starting an OAuth redirect. The query string on
 * /sign-in is lost on the round trip to Google/GitHub, so keep a copy.
 * With no invite in the URL, any old copy is cleared so it can't leak
 * into a later, unrelated sign-in.
 */
export function rememberRedirect(): void {
    if (typeof window === "undefined") return;
    const safe = readFromUrl();
    try {
        if (safe) window.sessionStorage.setItem(STORAGE_KEY, safe);
        else window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
        /* storage unavailable — the query-string copy still works */
    }
}

export function clearRememberedRedirect(): void {
    if (typeof window === "undefined") return;
    try {
        window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
        /* ignore */
    }
}

/** URL param first, then the sessionStorage copy. */
export function getSsoRedirect(): string | null {
    return readFromUrl() ?? readFromStorage();
}

const withRedirect = (base: string, redirect: string | null) =>
    redirect ? `${base}?redirect_url=${encodeURIComponent(redirect)}` : base;

/** Where the sign-in / sign-up forms send the user after auth. */
export function getCallbackUrl(): string {
    return withRedirect("/callback", readFromUrl());
}

/** `redirectCallbackUrl` for signIn.sso(), carrying the invite through OAuth. */
export function getSsoCallbackPath(): string {
    return withRedirect("/sso-callback", readFromUrl());
}

/** Where /sso-callback forwards the user once Clerk finishes. */
export function getSsoCallbackUrl(): string {
    return withRedirect("/callback", getSsoRedirect());
}