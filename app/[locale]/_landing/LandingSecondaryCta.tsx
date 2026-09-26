'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useVisitorPlatformTarget } from '@/lib/useVisitorPlatformTarget'
import { LandingCtaLink } from './LandingCtaLink'

interface Props {
  /** Sign-in href — this link always goes there (#1413), whichever label it wears. */
  signInHref: string
  className?: string
  style?: CSSProperties
  /** Default label ("已經有帳號 · 登入") for every variant except android_beta. */
  children: ReactNode
  /** Android-beta variant's label ("先用網頁版") — the form is the primary CTA
   *  there, so this link needs to read as an alternative, not a returning-user
   *  sign-in (#1413). */
  androidLabel: ReactNode
}

/**
 * Secondary sign-in link next to/under the landing's primary CTA. Same
 * platform resolution as `LandingPrimaryCta` (independent instance): every
 * variant keeps the "already have an account" label except `android_beta`,
 * whose primary CTA is the beta signup form, so this reads "use the web
 * version instead" (#1413).
 *
 * Unlike the primary CTA, this stays fully hidden (`opacity-0`) rather than a
 * visible placeholder while pending — it's a small secondary link, so hiding
 * it doesn't read as a broken page the way an invisible primary CTA did, and
 * a transparent-text placeholder buys nothing extra here. `LandingCtaLink`'s
 * `inert` prop still adds `pointer-events-none` as a plain CSS class (not
 * just an `onClick` guard) so a pre-hydration tap can't follow it either.
 */
export function LandingSecondaryCta({ signInHref, className, style, children, androidLabel }: Props) {
  const target = useVisitorPlatformTarget()

  if (target === 'pending') {
    return (
      <LandingCtaLink
        href={signInHref}
        ctaLocation="secondary"
        target="sign_in"
        className={`${className ?? ''} opacity-0`.trim()}
        style={style}
        inert
      >
        {children}
      </LandingCtaLink>
    )
  }

  return (
    <LandingCtaLink
      href={signInHref}
      ctaLocation="secondary"
      target="sign_in"
      className={className}
      style={style}
    >
      {target === 'android_beta' ? androidLabel : children}
    </LandingCtaLink>
  )
}
