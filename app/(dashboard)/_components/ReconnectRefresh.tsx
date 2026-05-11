'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

const VISIBILITY_REFRESH_THRESHOLD_MS = 30_000

/**
 * Force-refreshes the current route when the device comes back online or the
 * PWA is foregrounded after being hidden for a while.
 *
 * Why this exists:
 *   - iOS PWA standalone has no pull-to-refresh and no address bar reload.
 *   - Next.js Router Cache + Serwist `NetworkFirst` can both keep serving stale
 *     RSC payloads after a flaky-network episode. Without an explicit trigger,
 *     users get stuck on the offline snapshot until they kill and reopen the
 *     PWA (issue #126).
 *
 * `router.refresh()` invalidates the Router Cache for the current route and
 * re-fetches its RSC payload while preserving client state — no full reload.
 */
export function ReconnectRefresh() {
  const router = useRouter()
  const lastRefreshAt = useRef(0)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const refresh = () => {
      lastRefreshAt.current = Date.now()
      router.refresh()
    }

    const handleOnline = () => {
      // Coming back from offline almost always means stale data. Refresh
      // unconditionally so the user doesn't have to think about it.
      refresh()
    }

    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return
      if (!navigator.onLine) return
      // Backgrounded for less than the threshold → trust the Router Cache.
      // Beyond the threshold (e.g. PWA returning from background hours later)
      // we'd rather pay one extra fetch than show day-old numbers.
      if (Date.now() - lastRefreshAt.current < VISIBILITY_REFRESH_THRESHOLD_MS) return
      refresh()
    }

    window.addEventListener('online', handleOnline)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('online', handleOnline)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [router])

  return null
}
