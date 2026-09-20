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
  // 'pending' until the effect has read the platform. The markup is rendered
  // during SSR either way — crawlers and no-JS readers still get the App Store
  // link — but it is inert until we know this is not the iOS shell.
  //
  // Why not just `return null` while pending: the gate can only run after
  // mount, so between paint and hydration the shell would show a tappable
  // 「下載 iPhone 版」 to someone already inside the app (a plain <a> needs no
  // JS to work). Inside the shell that window is the whole remote page load.
  // Hiding first and revealing second moves the flash to the harmless side:
  // web visitors briefly miss a footnote instead of shell users being told to
  // install what they are already using.
  const [gate, setGate] = useState<'pending' | 'show' | 'hide'>('pending')

  useEffect(() => {
    setGate(getCapacitorPlatform() === 'ios' ? 'hide' : 'show')
  }, [])

  if (gate === 'hide') return null

  const pending = gate === 'pending'

  return (
    <p
      className={`m-0 mt-3 text-center md:text-left text-xs text-ink-3${pending ? ' opacity-0' : ''}`}
      style={{ letterSpacing: '0.3px' }}
      aria-hidden={pending || undefined}
    >
      <a
        href={APP_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="underline outline-none focus-visible:oik-focus-ring text-ink-2 inline-flex min-h-11 items-center"
        tabIndex={pending ? -1 : undefined}
        onClick={(e) => {
          // Inert while pending: the platform is still unknown, so a tap here
          // could be the iOS shell's.
          if (pending) { e.preventDefault(); return }
          track('landing_app_store_link_clicked', { cta_location: 'hero' })
        }}
      >
        {linkText}
      </a>
      {' · '}
      {androidNote}
    </p>
  )
}
