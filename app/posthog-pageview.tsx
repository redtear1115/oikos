'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, Suspense } from 'react'
import { POSTHOG_ENABLED } from '@/lib/analytics/enabled'
import { track } from '@/lib/analytics/track'
import { sanitizeAnalyticsUrl } from '@/lib/analytics/urlSanitizer'

function PostHogPageViewInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (POSTHOG_ENABLED && pathname) {
      let url = window.location.origin + pathname
      const search = searchParams?.toString()
      if (search) url += `?${search}`
      // Through track(), not posthog directly: PostHog loads lazily (#1520), so a
      // pageview fired before it is up waits in the queue instead of vanishing.
      // #1274 — sanitized here as well as in the shared `before_send`, so this
      // explicit value is clean even if the hook is ever unwired. Unwired
      // looks like nothing: invite tokens and filter amounts silently return
      // to PostHog's URL column.
      track('$pageview', { $current_url: sanitizeAnalyticsUrl(url) })
    }
  }, [pathname, searchParams])

  return null
}

export function PostHogPageView() {
  return (
    <Suspense fallback={null}>
      <PostHogPageViewInner />
    </Suspense>
  )
}
