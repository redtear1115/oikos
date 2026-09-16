'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { usePostHog } from 'posthog-js/react'
import { useEffect, Suspense } from 'react'
import { POSTHOG_ENABLED } from '@/lib/analytics/enabled'
import { sanitizeAnalyticsUrl } from '@/lib/analytics/urlSanitizer'

function PostHogPageViewInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const posthog = usePostHog()

  useEffect(() => {
    if (POSTHOG_ENABLED && pathname && posthog) {
      let url = window.location.origin + pathname
      const search = searchParams?.toString()
      if (search) url += `?${search}`
      // #1274 — sanitized here as well as in the shared `before_send`, so this
      // explicit value is clean even if the hook is ever unwired. Unwired
      // looks like nothing: invite tokens and filter amounts silently return
      // to PostHog's URL column.
      posthog.capture('$pageview', { $current_url: sanitizeAnalyticsUrl(url) })
    }
  }, [pathname, searchParams, posthog])

  return null
}

export function PostHogPageView() {
  return (
    <Suspense fallback={null}>
      <PostHogPageViewInner />
    </Suspense>
  )
}
