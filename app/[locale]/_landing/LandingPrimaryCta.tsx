'use client'

import type { CSSProperties, ReactNode } from 'react'
import { track } from '@/lib/analytics/track'
import { useVisitorPlatformTarget } from '@/lib/useVisitorPlatformTarget'
import { APP_STORE_URL } from '@/lib/visitorPlatform'
import { LandingCtaLink } from './LandingCtaLink'

interface Props {
  /** Logged-out, non-iOS/Android destination — SSR default (locale-aware /sign-in). */
  signInHref: string
  /** Logged-in destination, swapped in after client hydration (/dashboard). */
  dashboardHref: string
  ctaLocation: 'hero' | 'desktop_header'
  className?: string
  style?: CSSProperties
  /** Sign-in / dashboard label — the existing copy, unchanged. */
  children: ReactNode
  /** iPhone/iPad browser label, links out to the App Store (#1413). */
  appStoreLabel: ReactNode
  /** Android browser label, links to the self-serve join page (#1413, #1648). */
  androidBetaLabel: ReactNode
  /** Locale-pinned href of the /android-beta page (`localizedHref(ANDROID_BETA_PATH, locale)`). */
  androidBetaHref: string
}

// The two external variants render a plain <a> (next/link can't point off-site),
// so they reuse LandingCtaLink's focus-ring utility by hand instead of getting
// it from the component.
const FOCUS_RING_CLASS = 'outline-none focus-visible:oik-focus-ring'

/**
 * Primary landing CTA whose destination depends on the visitor's device and
 * auth state (#920 Phase 1, extended by #1413, reworked by #1521):
 *
 *   session (any platform)          → /dashboard
 *   Capacitor shell / installed PWA → sign-in (never App Store — Apple 3.1.1)
 *   iPhone / iPad browser           → App Store
 *   Android browser                 → /android-beta join page (#1648)
 *   everything else                 → sign-in
 *
 * Platform is runtime-only (see `lib/visitorPlatform.ts`), so
 * `useVisitorPlatformTarget` starts `'pending'`. #1521: while pending, this
 * renders the sign-in default as an ordinary labelled, focusable, clickable
 * link — the same element the "everything else" branch renders — and re-points
 * it after hydration. Every variant shares the caller's `className`/`style`, so
 * the box never changes; only the label text (and href) swap. Desktop, where
 * the resolved target stays sign-in, renders identical markup before and after.
 *
 * Why not the earlier invisible/inert placeholder (#1413): it left the CTA an
 * empty dark bar with JS off and for the whole slow-connection window, and
 * failed the "primary action must work" bar. The failure it guarded against —
 * a shell webview or an iPhone tap before hydration reaching the wrong
 * destination — now degrades safely: sign-in is correct for a shell (Apple
 * 3.1.1 forbids the App Store link there), and the only accepted cost is an
 * iPhone *browser* user who taps before hydration landing on sign-in instead
 * of the App Store (owner decision, 2026-10-03). The App Store / beta
 * anchors below are only ever rendered once `target` has resolved, and
 * `resolveVisitorPlatform` never returns `app_store` for a Capacitor shell or
 * standalone PWA, so no shell can reach `APP_STORE_URL`.
 *
 * Analytics: `landing_cta_clicked` is fired from `onClick`, which needs React
 * hydrated. A pre-hydration (or no-JS) tap is a plain navigation, so the event
 * cannot fire for it — expect those clicks to be missing from the funnel, not
 * mis-attributed (the `?from=landing` tag on the href still carries sign-up
 * attribution). Post-hydration taps report the resolved destination.
 */
export function LandingPrimaryCta({
  signInHref,
  dashboardHref,
  ctaLocation,
  className,
  style,
  children,
  appStoreLabel,
  androidBetaLabel,
  androidBetaHref,
}: Props) {
  const target = useVisitorPlatformTarget()

  if (target === 'app_store') {
    return (
      <a
        href={APP_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={`${FOCUS_RING_CLASS} ${className ?? ''}`.trim()}
        style={style}
        onClick={() => track('landing_cta_clicked', { cta_location: ctaLocation, target: 'app_store' })}
      >
        {appStoreLabel}
      </a>
    )
  }

  if (target === 'android_beta') {
    return (
      // Internal link, same tab. The caller pins the locale: a bare /android-beta
      // for en/ja/zh-CN would be rewritten to zh-TW by proxy.ts and overwrite the
      // locale cookie, silently switching the visitor's whole app to zh-TW.
      <a
        href={androidBetaHref}
        className={`${FOCUS_RING_CLASS} ${className ?? ''}`.trim()}
        style={style}
        onClick={() => track('landing_cta_clicked', { cta_location: ctaLocation, target: 'android_beta' })}
      >
        {androidBetaLabel}
      </a>
    )
  }

  return (
    <LandingCtaLink
      href={target === 'dashboard' ? dashboardHref : signInHref}
      ctaLocation={ctaLocation}
      target="sign_in"
      className={className}
      style={style}
    >
      {children}
    </LandingCtaLink>
  )
}
