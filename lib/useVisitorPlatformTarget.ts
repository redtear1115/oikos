'use client'

import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { loadSupabaseClient } from '@/lib/supabase/lazyClient'
import { hasStoredSessionCookie } from '@/lib/auth/storedSession'
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
 * Callers must render `'pending'` as the sign-in default, labelled and
 * clickable (#1521) — it is the SSR markup, so it has to work with JS off and
 * before hydration. It is also the safe default for a shell, where sign-in is
 * the only correct destination (never the App Store, Apple 3.1.1).
 */
export function useVisitorPlatformTarget(): VisitorPlatformTarget | 'pending' {
  const [target, setTarget] = useState<VisitorPlatformTarget | 'pending'>('pending')

  useEffect(() => {
    let active = true
    const resolve = (hasSession: boolean) => {
      if (!active) return
      setTarget(
        resolveVisitorPlatform({
          userAgent: navigator.userAgent,
          maxTouchPoints: navigator.maxTouchPoints,
          isCapacitor: isCapacitorShell(),
          isStandalone: isStandalone(),
          hasSession,
        }),
      )
    }
    // #1520 — the Supabase client is ~0.5 s of LCP on the landing, and the
    // browser client keeps its session in a cookie only, so a device without
    // one cannot have a session: answer without loading the SDK. With a cookie
    // (a returning signed-in visitor) load it and ask, as before.
    if (!hasStoredSessionCookie(document.cookie)) {
      resolve(false)
    } else {
      // getSession() is cookie/storage-local — no Auth API round-trip — matching
      // LandingPrimaryCta's existing session check.
      void loadSupabaseClient()
        .then((supabase) => supabase.auth.getSession())
        .then(({ data }: { data: { session: Session | null } }) => resolve(Boolean(data.session)))
    }
    return () => {
      active = false
    }
  }, [])

  return target
}
