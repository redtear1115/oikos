'use client'

import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { isStandalone } from '@/lib/install-guide'
import { resolveVisitorPlatform, type VisitorPlatformTarget } from '@/lib/visitorPlatform'

/** Same presence check as `LandingStandaloneRedirect`'s local `isCapacitor` —
 *  the native WebView injects this global on both iOS and Android shells. */
function isCapacitorShell(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as Record<string, unknown>).Capacitor
}

/**
 * Resolves which landing-page primary-CTA variant this visitor should see
 * (#1413). Starts `'pending'` — platform is runtime-only, so SSR can never
 * know it — and settles once this effect reads the local session plus the
 * platform signals `resolveVisitorPlatform` needs.
 *
 * Callers must render the `'pending'` state hidden and inert (see
 * `LandingPrimaryCta`): a visible CTA saying the wrong thing for a beat — sign
 * in shown to an iPhone visitor, an App Store link shown inside the iOS shell
 * itself — is worse than a beat of invisibility. Same hide-first reasoning as
 * `AppStoreNote` (#1333), which this replaces.
 */
export function useVisitorPlatformTarget(): VisitorPlatformTarget | 'pending' {
  const [target, setTarget] = useState<VisitorPlatformTarget | 'pending'>('pending')

  useEffect(() => {
    let active = true
    const supabase = createClient()
    // getSession() is cookie/storage-local — no Auth API round-trip — matching
    // LandingPrimaryCta's existing session check.
    void supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      if (!active) return
      setTarget(
        resolveVisitorPlatform({
          userAgent: navigator.userAgent,
          maxTouchPoints: navigator.maxTouchPoints,
          isCapacitor: isCapacitorShell(),
          isStandalone: isStandalone(),
          hasSession: Boolean(data.session),
        }),
      )
    })
    return () => {
      active = false
    }
  }, [])

  return target
}
