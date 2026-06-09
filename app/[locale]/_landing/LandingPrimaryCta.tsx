'use client'

import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { LandingCtaLink } from './LandingCtaLink'

interface Props {
  /** Logged-out destination, rendered at SSR (locale-aware /sign-in). */
  signInHref: string
  /** Logged-in destination, swapped in after client hydration (/dashboard). */
  dashboardHref: string
  ctaLocation: 'hero' | 'desktop_header'
  className?: string
  style?: CSSProperties
  children: ReactNode
}

/**
 * Primary landing CTA whose href is auth-dependent (#920 Phase 1).
 *
 * The landing page no longer reads auth on the server (that round-trip moved
 * off the critical path), so the CTA renders pointing at /sign-in by default
 * and, after hydration, reads the local session via the browser Supabase client
 * (getSession() is cookie-local — no Auth API round-trip) and swaps to
 * /dashboard for signed-in viewers. The visible label is unchanged, so the only
 * observable effect is the link destination — an accepted brief flash.
 *
 * The `target` stays "sign_in" for analytics continuity; LandingCtaLink keys its
 * `?from=landing` tagging off the resolved href, so once it points at /dashboard
 * the tag is correctly omitted.
 */
export function LandingPrimaryCta({
  signInHref,
  dashboardHref,
  ctaLocation,
  className,
  style,
  children,
}: Props) {
  const [href, setHref] = useState(signInHref)

  useEffect(() => {
    let active = true
    const supabase = createClient()
    void supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      if (active && data.session) setHref(dashboardHref)
    })
    return () => {
      active = false
    }
  }, [dashboardHref])

  return (
    <LandingCtaLink
      href={href}
      ctaLocation={ctaLocation}
      target="sign_in"
      className={className}
      style={style}
    >
      {children}
    </LandingCtaLink>
  )
}
