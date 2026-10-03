'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import type { Session } from '@supabase/supabase-js'
import { loadSupabaseClient } from '@/lib/supabase/lazyClient'
import { hasStoredSessionCookie } from '@/lib/auth/storedSession'

/**
 * How long the curtain may wait for `getSession()` before the buttons are shown
 * anyway. A hung refresh must never leave someone stuck behind a screen with no
 * way out; if the session does come back later, the redirect still happens.
 */
export const SESSION_CHECK_TIMEOUT_MS = 10_000

/**
 * #1540 — an auto-redirect within this long of the previous one is treated as
 * a loop: the page shows its sign-in form instead of redirecting again.
 */
export const REDIRECT_LOOP_WINDOW_MS = 15_000
export const REDIRECT_AT_KEY = 'futari:signed-in-redirect-at'

/**
 * Records this redirect and says whether it may go ahead. sessionStorage can
 * throw (private mode, blocked storage); then there is no breaker, and the
 * redirect still happens — the proxy's cookie clean-up is the main defence.
 */
function claimRedirect(): boolean {
  const now = Date.now()
  try {
    const last = Number(window.sessionStorage.getItem(REDIRECT_AT_KEY))
    if (last > 0 && now - last >= 0 && now - last < REDIRECT_LOOP_WINDOW_MS) return false
  } catch {
    // unreadable → treat as no previous redirect
  }
  try {
    window.sessionStorage.setItem(REDIRECT_AT_KEY, String(now))
  } catch {
    // unwritable → redirect anyway
  }
  return true
}

const noSubscribe = () => () => {}
const always = () => true

/**
 * "Already signed in → go to the ledger", shared by the sign-in page and the
 * installed-app landing (#920 / #949). Returns whether the waiting curtain
 * should cover the page.
 *
 * #1318 — the redirect used to run behind a fully usable page. On a cold start
 * with an expired access token, `getSession()` refreshes over the network
 * first (3–5 s in the shells), so a signed-in user saw the sign-in form, tapped
 * Google, and the `location.replace` then landed in the middle of that OAuth
 * attempt — which is also what the #1314 `ChunkLoadError`s were. Now, when the
 * device holds a session cookie, the curtain covers the page from the first
 * client frame until the check settles:
 * - session → replace to `target`, curtain stays up through the navigation
 * - no session (refresh token revoked, signed out elsewhere) → curtain lifts
 * - neither within {@link SESSION_CHECK_TIMEOUT_MS} → curtain lifts
 * Devices without a session cookie (new visitors) never see the curtain.
 *
 * `getSession()` reads the cookie (refreshing only an expired token); it does
 * not ask the server whether the session is still alive. It is a navigation
 * hint — the proxy's `getUser()` is the gate. `getClaims()` would not help:
 * local JWT verification can't see a session revoked before the token expires.
 *
 * #1540 — loop safety. When the hint says "signed in" but the proxy says no,
 * the proxy sends the browser back here. Two things stop that from repeating:
 * 1. the proxy copies Supabase's cookie removals onto that redirect and
 *    expires the session cookie on a definitive rejection (proxy.ts), so the
 *    next `getSession()` finds no session;
 * 2. for what the proxy can't classify (Supabase outage, 429, timeouts) this
 *    hook redirects at most once per {@link REDIRECT_LOOP_WINDOW_MS}; a second
 *    attempt inside the window lifts the curtain and shows the form instead.
 * The failure looks like the sign-in page (or the installed-app landing, which
 * shares this hook) flickering between itself and /dashboard forever, with no
 * error anywhere.
 *
 * The cookie is read through `useSyncExternalStore` with a `false` server
 * snapshot: the server can't see the browser's cookies the same way, and
 * reading them during render would make hydration disagree with the HTML.
 *
 * `target` and `when` must be stable (module-level functions or strings).
 */
export function useSignedInRedirect(
  target: string | (() => string),
  when: () => boolean = always,
): boolean {
  const stored = useSyncExternalStore(
    noSubscribe,
    () => when() && hasStoredSessionCookie(document.cookie),
    () => false,
  )
  const [settled, setSettled] = useState(false)

  useEffect(() => {
    if (!when()) return
    // #1520 — no session cookie means no session (the browser client stores it
    // in cookies only), so a new visitor never loads the Supabase SDK on the
    // sign-in page or the landing. A device that does hold one loads it now,
    // under the waiting curtain, not after idle.
    if (!hasStoredSessionCookie(document.cookie)) return
    let active = true
    const timer = setTimeout(() => {
      if (active) setSettled(true)
    }, SESSION_CHECK_TIMEOUT_MS)
    loadSupabaseClient()
      .then((supabase) => supabase.auth.getSession())
      .then(({ data }: { data: { session: Session | null } }) => {
        if (!active) return
        if (data.session && claimRedirect()) {
          window.location.replace(typeof target === 'function' ? target() : target)
        } else {
          setSettled(true)
        }
      })
      .catch(() => {
        if (active) setSettled(true)
      })
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [target, when])

  return stored && !settled
}
