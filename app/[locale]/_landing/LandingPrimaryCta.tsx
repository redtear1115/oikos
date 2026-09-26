'use client'

import type { CSSProperties, ReactNode } from 'react'
import { track } from '@/lib/analytics/track'
import { useVisitorPlatformTarget } from '@/lib/useVisitorPlatformTarget'
import { ANDROID_BETA_FORM_URL, APP_STORE_URL } from '@/lib/visitorPlatform'
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
  /** Android browser label, links out to the beta signup form (#1413). */
  androidBetaLabel: ReactNode
}

// The two external variants render a plain <a> (next/link can't point off-site),
// so they reuse LandingCtaLink's focus-ring utility by hand instead of getting
// it from the component.
const FOCUS_RING_CLASS = 'outline-none focus-visible:oik-focus-ring'

/**
 * Primary landing CTA whose destination depends on the visitor's device and
 * auth state (#920 Phase 1, extended by #1413):
 *
 *   session (any platform)          → /dashboard
 *   Capacitor shell / installed PWA → sign-in (never App Store — Apple 3.1.1)
 *   iPhone / iPad browser           → App Store
 *   Android browser                 → Android beta signup form
 *   everything else                 → sign-in
 *
 * Platform is runtime-only (see `lib/visitorPlatform.ts`), so
 * `useVisitorPlatformTarget` starts `'pending'` and this renders a visible
 * placeholder until it resolves: the exact box the resolved CTA will occupy
 * (every variant shares the same `className`/`style` from the caller, so the
 * box never needs to change size or position), with its label text made
 * `text-transparent` rather than the button being hidden outright. A
 * verifier flagged the earlier fully-hidden version as a worse trade — an
 * invisible primary CTA reads as a broken page for that beat, and on a slow
 * connection that beat isn't always short. The placeholder is `aria-hidden`,
 * `tabIndex=-1`, and (via `LandingCtaLink`'s `inert` prop) `pointer-events-none`
 * as a plain CSS class — not just an `onClick` guard — because `onClick` only
 * runs after React hydrates, and the whole pre-hydration window is exactly
 * when a shell webview or a slow mobile connection can catch a stray tap; a
 * class-based guard blocks it before any JS runs.
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
}: Props) {
  const target = useVisitorPlatformTarget()

  if (target === 'pending') {
    return (
      <LandingCtaLink
        href={signInHref}
        ctaLocation={ctaLocation}
        target="sign_in"
        className={className}
        style={style}
        inert
      >
        {/* Text only — the box itself (background/size/shape from `style` +
            `className` above) stays visible so the primary action's position
            never jumps once the real variant resolves. */}
        <span className="text-transparent">{children}</span>
      </LandingCtaLink>
    )
  }

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
      <a
        href={ANDROID_BETA_FORM_URL}
        target="_blank"
        rel="noopener noreferrer"
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
