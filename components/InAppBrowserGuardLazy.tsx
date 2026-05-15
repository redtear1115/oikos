'use client'

import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'
import type { InAppBrowserGuard as Guard } from './InAppBrowserGuard'

// Lazy wrapper so the guard's UA check + full-screen markup doesn't ship in the
// initial client bundle of every public page. The vast majority of visitors
// aren't in an in-app WebView, so the guard renders nothing — we can pay the
// extra chunk fetch only when JS actually starts running, after LCP. (#352)
const LazyGuard = dynamic(
  () => import('./InAppBrowserGuard').then((m) => m.InAppBrowserGuard),
  { ssr: false, loading: () => null }
)

export function InAppBrowserGuardLazy(props: ComponentProps<typeof Guard>) {
  return <LazyGuard {...props} />
}
