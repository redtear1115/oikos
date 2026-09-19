'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import type { Session } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { hasStoredSessionCookie } from '@/lib/auth/storedSession'

/**
 * How long the curtain may wait for `getSession()` before the buttons are shown
 * anyway. A hung refresh must never leave someone stuck behind a screen with no
 * way out; if the session does come back later, the redirect still happens.
 */
export const SESSION_CHECK_TIMEOUT_MS = 10_000

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
    let active = true
    const timer = setTimeout(() => {
      if (active) setSettled(true)
    }, SESSION_CHECK_TIMEOUT_MS)
    createClient()
      .auth.getSession()
      .then(({ data }: { data: { session: Session | null } }) => {
        if (!active) return
        if (data.session) {
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
