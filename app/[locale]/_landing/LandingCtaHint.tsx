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
 * `LandingPrimaryCta` (independent instance) — hidden while pending so a
 * visitor never briefly reads the sign-in caption under an App Store button
 * (#1413).
 */
export function LandingCtaHint({ className, style, children, appStoreHint, androidBetaHint }: Props) {
  const target = useVisitorPlatformTarget()
  const pending = target === 'pending'

  const label = target === 'app_store' ? appStoreHint : target === 'android_beta' ? androidBetaHint : children

  return (
    <p
      className={`${className ?? ''}${pending ? ' opacity-0' : ''}`.trim()}
      style={style}
      aria-hidden={pending || undefined}
    >
      {label}
    </p>
  )
}
