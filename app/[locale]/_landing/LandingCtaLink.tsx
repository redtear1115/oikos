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

interface Props {
  href: string
  /** Where on the page this CTA sits — for breakdown. */
  ctaLocation: 'hero' | 'desktop_header' | 'secondary' | 'footer_migrate'
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
  return (
    <Link
      href={finalHref}
      className={className}
      style={style}
      aria-label={ariaLabel}
      onClick={() => track('landing_cta_clicked', { cta_location: ctaLocation, target })}
    >
      {children}
    </Link>
  )
}
