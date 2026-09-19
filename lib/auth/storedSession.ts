/**
 * #1318 — does this device hold a Supabase session cookie at all?
 *
 * Synchronous and network-free on purpose. `getSession()` is not: when the
 * access token has expired (the app was closed for over an hour) it refreshes
 * over the network first, which on a cold-started shell took 3–5 s. This is
 * the question that can be answered on the first frame, so the sign-in
 * buttons can be covered before anyone taps them.
 *
 * `@supabase/ssr` stores the session as `sb-<ref>-auth-token`, split into
 * `.0`, `.1`, … when large. `sb-<ref>-auth-token-code-verifier` is the PKCE
 * verifier of an OAuth attempt in flight — not a session — and must not count.
 *
 * A match only means "worth waiting for": the refresh token may have been
 * revoked. The caller still has to confirm with `getSession()`.
 */
const SESSION_COOKIE_RE = /(?:^|;\s*)sb-[^=;]+-auth-token(?:\.\d+)?=[^;\s]/

export function hasStoredSessionCookie(cookie: string): boolean {
  return SESSION_COOKIE_RE.test(cookie)
}
