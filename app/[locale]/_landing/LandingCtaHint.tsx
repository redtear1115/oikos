'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useVisitorPlatformTarget } from '@/lib/useVisitorPlatformTarget'

interface Props {
  className?: string
  style?: CSSProperties
  /** Default hint (sign-in / dashboard variants), e.g. "免費 · 兩人一本帳 · 用 Google 或 Apple 繼續". */
  children: ReactNode
  /** iPhone/iPad browser hint — the default text describes the sign-in flow,
   *  which is wrong once the CTA points at the App Store (#1413). */
  appStoreHint: ReactNode
  /** Android browser hint — must say what the beta form asks for and why, per
   *  issue #1413: fill in the Google account used on Play, only used to send
   *  the test invite, deleted once added to the closed-testing list. */
  androidBetaHint: ReactNode
}

/**
 * Caption line under the mobile hero CTA. Same platform resolution as
 * `LandingPrimaryCta` (independent instance). #1521: while pending it shows
 * the default (sign-in) caption, which matches the sign-in CTA rendered in
 * that state; only iPhone/iPad and Android visitors see it swap after
 * hydration.
 */
export function LandingCtaHint({ className, style, children, appStoreHint, androidBetaHint }: Props) {
  const target = useVisitorPlatformTarget()
  const label = target === 'app_store' ? appStoreHint : target === 'android_beta' ? androidBetaHint : children

  return (
    <p
      className={className}
      style={style}
    >
      {label}
    </p>
  )
}
