'use client'

import { isStandalone } from '@/lib/install-guide'
import { useSignedInRedirect } from '../sign-in/useSignedInRedirect'
import { WaitingCurtain } from '../sign-in/WaitingCurtain'

/** True when running inside a Capacitor native shell (iOS / Android) — the
 *  native WebView does not report `display-mode: standalone`, so this is a
 *  separate signal from {@link isStandalone}. */
function isCapacitor(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as Record<string, unknown>).Capacitor
}

/**
 * #949 — installed-app entry gate.
 *
 * The landing is the PWA `start_url` and the Capacitor `server.url`, so a
 * signed-in user reopening the installed app would otherwise land on the public
 * marketing page every launch (the landing never redirects on the server — see
 * #920 Phase 1). Only in an *installed* context (standalone PWA or Capacitor
 * native — never a plain browser tab, which keeps the public-landing / SEO
 * design intact) redirect to the dashboard when a local session exists.
 *
 * `getSession()` is cookie/storage-local (no Auth API round-trip), matching
 * LandingPrimaryCta, so the cost is negligible and web visitors are unaffected.
 * Uses a hard `window.location.replace` (like the sign-in SignedInRedirect) to
 * cross cleanly into the authed dashboard route group and drop the landing from
 * the back-stack.
 */
/** Only an installed context (PWA or native shell) skips the public landing. */
function isInstalledApp(): boolean {
  return isStandalone() || isCapacitor()
}

export function LandingStandaloneRedirect({
  dashboardHref,
  checkingLabel,
}: {
  dashboardHref: string
  checkingLabel: string
}) {
  // #1318 — cover the landing while a stored session is being confirmed, so
  // a signed-in user reopening the app doesn't tap into the sign-in flow in
  // the seconds a token refresh takes. See useSignedInRedirect.
  const checking = useSignedInRedirect(dashboardHref, isInstalledApp)
  return checking ? <WaitingCurtain label={checkingLabel} /> : null
}
