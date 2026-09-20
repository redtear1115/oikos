'use client'

import { useEffect, useState } from 'react'
import { track } from '@/lib/analytics/track'

// #1333: the iPhone app went live on the App Store (id6779264784) while
// Android has no Play Store listing yet. The link is region-neutral — Apple
// redirects `/app/id...` to the visitor's own storefront — so don't hard-code
// a `/tw/` (or any other) locale segment into it.
const APP_STORE_URL = 'https://apps.apple.com/app/id6779264784'

/**
 * Capacitor's platform string ('ios' | 'android' | 'web'), read from the global
 * the native webview injects. Returns 'web' off-shell (browser, SSR, jsdom).
 * Same helper as `components/KofiWidget.tsx` — kept as a local copy rather than
 * a shared import so the public landing bundle doesn't pull in anything beyond
 * this one small read (see that file's comment for why this must be a runtime
 * check, not a build-time flag: one prod deployment serves web + both shells).
 */
function getCapacitorPlatform(): string {
  if (typeof window === 'undefined') return 'web'
  const cap = (window as { Capacitor?: { getPlatform?: () => string } }).Capacitor
  return cap?.getPlatform?.() ?? 'web'
}

/**
 * Quiet secondary line under the hero CTA: "the iPhone app is on the App
 * Store, Android is on the way". Hidden inside the iOS native shell — telling
 * someone already inside the app to go download it is absurd, and Apple
 * Guideline 3.1.1-adjacent review risk to boot. Web, PWA and Android (which
 * has no native shell yet) all see it.
 *
 * Starts false to match SSR (which always renders the line), then the effect
 * flips it on the iOS shell after mount — same hydration-safe pattern as
 * `KofiWidget`'s iOS gate.
 */
export function AppStoreNote({
  linkText,
  androidNote,
}: {
  linkText: string
  androidNote: string
}) {
  const [isIosNative, setIsIosNative] = useState(false)

  useEffect(() => {
    if (getCapacitorPlatform() === 'ios') setIsIosNative(true)
  }, [])

  if (isIosNative) return null

  return (
    <p
      className="m-0 mt-3 text-center md:text-left text-xs"
      style={{ color: 'var(--ink-3)', letterSpacing: '0.3px' }}
    >
      <a
        href={APP_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="underline outline-none focus-visible:oik-focus-ring"
        style={{ color: 'var(--ink-2)' }}
        onClick={() => track('landing_app_store_link_clicked', { cta_location: 'hero' })}
      >
        {linkText}
      </a>
      {' · '}
      {androidNote}
    </p>
  )
}
