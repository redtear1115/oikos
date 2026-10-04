'use client'

import { useInsertionEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { GoogleAnalytics } from '@next/third-parties/google'

/**
 * #1558 — keep Google Analytics off the outing share link
 * (`/<locale>/outing/<shareToken>`, `/outing/<shareToken>`).
 *
 * ## Why this exists
 *
 * The share token is the only key to an outing, and it sits in the path.
 * gtag.js reports the raw page URL (`dl`) on every hit and has no `beforeSend`
 * hook like PostHog / Sentry / Vercel Insights, so the URL sanitizer cannot
 * reach it. The only safe option on that path is not to send.
 *
 * ## Contract
 *
 * - First load on an outing path: neither GA `<script>` is rendered (the
 *   decision uses `usePathname()`, which is correct during SSR, so the tags
 *   are absent from the HTML itself).
 * - Client navigation onto an outing path after GA has loaded: gtag cannot be
 *   unloaded, so `window['ga-disable-<id>']` (Google's documented opt-out,
 *   checked on every hit) is set for as long as the path is an outing path,
 *   and cleared when it is not. It is set in an insertion effect so it lands
 *   before the router's own insertion effect pushes the new URL — gtag's
 *   history-change `page_view` fires off that push.
 * - Once rendered, the component stays rendered (unmounting would not unload
 *   gtag and would re-run its `config` on the next mount).
 * - Only the singular `outing` segment counts; the signed-in
 *   `/outings/<uuid>` keeps reporting.
 *
 * ## What failure looks like
 *
 * Nothing errors. The share token just appears in GA's page-path reports,
 * where anyone with access to the property — shared across products for
 * Ko-fi attribution — can read it. `tests/google-analytics-gate.test.tsx` is
 * the only place this turns red. The other direction matters too: gating
 * every path off by mistake zeroes Ko-fi attribution with no error anywhere
 * (see the GA comment in `app/layout.tsx`).
 */
export function GoogleAnalyticsGate({ gaId }: { gaId: string }) {
  const pathname = usePathname()
  const blocked = isOutingSharePath(pathname)
  const [rendered, setRendered] = useState(!blocked)
  // Derived-state update during render: latches on the first non-outing path.
  if (!blocked && !rendered) setRendered(true)

  useInsertionEffect(() => {
    try {
      ;(window as unknown as Record<string, unknown>)[`ga-disable-${gaId}`] = blocked
    } catch {
      // A locked-down window object must not take the page down.
    }
  }, [gaId, blocked])

  if (!rendered) return null
  return <GoogleAnalytics gaId={gaId} />
}

/** `/outing/<token>` or `/<locale>/outing/<token>` (non-empty token). */
export function isOutingSharePath(pathname: string | null | undefined): boolean {
  if (typeof pathname !== 'string') return false
  const segments = pathname.split('/').filter(segment => segment !== '')
  const at = segments[0]?.toLowerCase() === 'outing' ? 0 : segments[1]?.toLowerCase() === 'outing' ? 1 : -1
  return at !== -1 && segments.length > at + 1
}
