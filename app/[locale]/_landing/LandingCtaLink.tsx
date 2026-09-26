'use client'

import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { track } from '@/lib/analytics/track'
import { appendQueryParam } from '@/lib/analytics/attribution'

export type Target =
  | 'sign_in'
  | 'migrate_honeydue'
  | 'migrate_spendee'
  | 'migrate_cwmoney'
  | 'use_case_cohabitation'
  | 'use_case_newlyweds'
  | 'use_case_pet_owners'
  /** iPhone/iPad browser primary CTA → App Store (#1413). */
  | 'app_store'
  /** Android browser primary CTA → beta signup form (#1413). */
  | 'android_beta'

interface Props {
  href: string
  /** Where on the page this CTA sits — for breakdown. */
  ctaLocation:
    | 'hero'
    | 'desktop_header'
    | 'secondary'
    | 'footer_migrate'
    | 'footer_use_case'
    | 'use_case_primary'
    | 'migrate_primary'
  target: Target
  /** Overrides the `from=landing` attribution tag. /migrate/<source> reuses this
   *  CTA off the landing page and tags its own slug, matching `MigrateCta`. */
  fromParam?: string
  className?: string
  style?: CSSProperties
  ariaLabel?: string
  /** Renders hidden and non-interactive (#1413): used by `LandingPrimaryCta`
   *  while the visitor's platform is still resolving. The SSR markup still
   *  exists — crawlers and no-JS readers see it — but a real visitor must not
   *  be able to see or tap it before we know which variant they should get.
   *  Same hide-first pattern as `AppStoreNote` (#1333). */
  inert?: boolean
  children: ReactNode
}

/**
 * Landing CTA that records `landing_cta_clicked` and tags sign-in destinations
 * with `?from=landing` so the OAuth callback can attribute the eventual sign-up.
 * The tag keys off the resolved href (a logged-in viewer's CTA points at
 * /dashboard and is left untouched); migrate destinations set their own `from`.
 */
export function LandingCtaLink({ href, ctaLocation, target, fromParam, className, style, ariaLabel, inert, children }: Props) {
  const finalHref = href.includes('/sign-in')
    ? appendQueryParam(href, 'from', fromParam ?? 'landing')
    : href
  // Reuse the shared `oik-focus-ring` utility (globals.css) so keyboard focus is
  // visible against dark-fill CTAs; pointer clicks stay clean via :focus-visible.
  const cls = ['outline-none focus-visible:oik-focus-ring', className].filter(Boolean).join(' ')
  return (
    <Link
      href={finalHref}
      className={cls}
      style={style}
      aria-label={ariaLabel}
      aria-hidden={inert || undefined}
      tabIndex={inert ? -1 : undefined}
      onClick={(e) => {
        // Still resolving (#1413): the platform is unknown, so a tap here
        // could be, say, the iOS shell's — don't navigate or track it.
        if (inert) { e.preventDefault(); return }
        track('landing_cta_clicked', { cta_location: ctaLocation, target })
      }}
    >
      {children}
    </Link>
  )
}
