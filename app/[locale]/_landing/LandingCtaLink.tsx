'use client'

import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { track } from '@/lib/analytics/track'
import { appendQueryParam } from '@/lib/analytics/attribution'

type Target =
  | 'sign_in'
  | 'migrate_honeydue'
  | 'migrate_spendee'
  | 'migrate_cwmoney'
  | 'use_case_cohabitation'
  | 'use_case_newlyweds'
  | 'use_case_pet_owners'

interface Props {
  href: string
  /** Where on the page this CTA sits — for breakdown. */
  ctaLocation: 'hero' | 'desktop_header' | 'secondary' | 'footer_migrate' | 'footer_use_case'
  target: Target
  className?: string
  style?: CSSProperties
  ariaLabel?: string
  children: ReactNode
}

/**
 * Landing CTA that records `landing_cta_clicked` and tags sign-in destinations
 * with `?from=landing` so the OAuth callback can attribute the eventual sign-up.
 * The tag keys off the resolved href (a logged-in viewer's CTA points at
 * /dashboard and is left untouched); migrate destinations set their own `from`.
 */
export function LandingCtaLink({ href, ctaLocation, target, className, style, ariaLabel, children }: Props) {
  const finalHref = href.includes('/sign-in') ? appendQueryParam(href, 'from', 'landing') : href
  // Reuse the shared `oik-focus-ring` utility (globals.css) so keyboard focus is
  // visible against dark-fill CTAs; pointer clicks stay clean via :focus-visible.
  const cls = ['outline-none focus-visible:oik-focus-ring', className].filter(Boolean).join(' ')
  return (
    <Link
      href={finalHref}
      className={cls}
      style={style}
      aria-label={ariaLabel}
      onClick={() => track('landing_cta_clicked', { cta_location: ctaLocation, target })}
    >
      {children}
    </Link>
  )
}
