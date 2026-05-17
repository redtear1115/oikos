'use client'

import { useState, useEffect, type ComponentProps } from 'react'
import dynamic from 'next/dynamic'
import { isInAppBrowser } from '@/lib/in-app-browser'
import type { InAppBrowserGuard as Guard } from './InAppBrowserGuard'

// Gate the heavy guard chunk behind a UA check done inside this wrapper.
// Previously, the dynamic import fired on every page mount and resolved the
// full-screen markup + iOS shortcut handling even though the vast majority of
// visitors aren't in an embedded WebView. Now the chunk is only requested when
// `isInAppBrowser(navigator.userAgent)` is actually true. (#511 / #352)
const LazyGuard = dynamic(
  () => import('./InAppBrowserGuard').then((m) => m.InAppBrowserGuard),
  { ssr: false, loading: () => null }
)

export function InAppBrowserGuardLazy(props: ComponentProps<typeof Guard>) {
  const [shouldMount, setShouldMount] = useState(false)
  useEffect(() => {
    if (typeof navigator === 'undefined') return
    if (isInAppBrowser(navigator.userAgent)) setShouldMount(true)
  }, [])
  if (!shouldMount) return null
  return <LazyGuard {...props} />
}
