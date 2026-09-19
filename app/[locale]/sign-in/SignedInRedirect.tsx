'use client'

import { safeSameOriginUrl } from '@/lib/auth/nativeRedirect'
import { useSignedInRedirect } from './useSignedInRedirect'
import { WaitingCurtain } from './WaitingCurtain'

/**
 * Client-side "already logged in → /dashboard" redirect (#920 Phase 1).
 *
 * The proxy no longer verifies auth on public paths (/sign-in is public), so the
 * server-side redirect that used to bounce signed-in viewers off the sign-in
 * form moved here. On mount we read the local session via the browser Supabase
 * client (getSession() is cookie-local — no Auth API round-trip); if a session
 * exists we replace the history entry with /dashboard so the sign-in form isn't
 * left in the back-stack. Renders the waiting curtain while a stored session is
 * being confirmed (#1318), nothing otherwise.
 *
 * #1275: honours `?next=` (set by the proxy when a signed-out visit hit a
 * protected page) so an already-signed-in viewer lands where they were headed.
 * `next` is untrusted query input — safeSameOriginUrl falls back to /dashboard
 * for anything that isn't a plain same-origin path.
 */
/** `?next=` if it is a safe same-origin path, else /dashboard. Read at redirect time. */
function signedInTarget(): string {
  const next = new URLSearchParams(window.location.search).get('next')
  return safeSameOriginUrl(window.location.origin, next ?? '/dashboard')
}

export function SignedInRedirect({ checkingLabel }: { checkingLabel: string }) {
  // #1318 — while the stored session is being confirmed, the sign-in buttons
  // stay covered; see useSignedInRedirect.
  const checking = useSignedInRedirect(signedInTarget)
  return checking ? <WaitingCurtain label={checkingLabel} /> : null
}
