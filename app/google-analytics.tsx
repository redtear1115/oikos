'use client'

import { Suspense, useInsertionEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { GoogleAnalytics } from '@next/third-parties/google'
import { isTokenBearingUrl } from '@/lib/analytics/tokenBearingUrl'

export { isOutingSharePath, isInviteTokenPath, isTokenBearingUrl } from '@/lib/analytics/tokenBearingUrl'

/**
 * #1558 / #1583 — keep Google Analytics off every URL that carries a bearer
 * secret: the outing share link (`/<locale>/outing/<shareToken>`), the group
 * invite (`/invite/<token>`), and any page whose `next` param points at one of
 * those (the signed-out invite bounce `/<locale>/sign-in?next=/invite/<token>`).
 * The predicates live in lib/analytics/tokenBearingUrl.ts.
 *
 * ## Why this exists
 *
 * gtag.js reports the raw page URL (`dl`, query included) and referrer (`dr`)
 * on every hit and has no `beforeSend` hook like PostHog / Sentry / Vercel
 * Insights, so the URL sanitizer cannot reach it. The only safe option on
 * those URLs is not to send.
 *
 * ## Contract
 *
 * - The decision reads the path AND the query, so it lives in a leaf that
 *   calls `useSearchParams()` inside its own `<Suspense fallback={null}>`.
 *   Do not hoist `useSearchParams()` above that boundary: on a prerendered
 *   route it client-renders everything up to the nearest Suspense, which in
 *   the root layout would be the whole page (brand-page LCP is ~30 ms under
 *   the 2.5 s gate). Dynamic routes (landing, sign-in, dashboard) render the
 *   leaf on the server; on a prerendered route only this leaf renders after
 *   hydration, which is when the afterInteractive GA scripts would load anyway.
 * - First load on a token-bearing URL: neither GA `<script>` is rendered (on
 *   dynamic routes the tags are absent from the HTML itself).
 * - Client navigation after GA has loaded: gtag cannot be unloaded, so
 *   `window['ga-disable-<id>']` (Google's documented opt-out, checked on every
 *   hit) is set. It is set in an insertion effect so it lands before the
 *   router's own insertion effect pushes the new URL — gtag's history-change
 *   `page_view` fires off that push. The decision uses the NEW search params
 *   at render time, not `window.location`.
 * - Sticky: once a token-bearing URL has been seen while gtag is loaded, the
 *   flag stays set until the next full page load. gtag keeps the previous page
 *   location in its in-memory state and may report it on the next
 *   history-change hit (as the page referrer), so re-enabling on the way out
 *   could leak the token we just blocked (#1583 F3).
 *   Landing on a token URL first (gtag not loaded yet) is not sticky: GA then
 *   loads fresh on the first normal page, with no memory of the token URL.
 * - Once rendered, the component stays rendered (unmounting would not unload
 *   gtag and would re-run its `config` on the next mount).
 * - Only the singular `outing` segment counts; the signed-in
 *   `/outings/<uuid>` keeps reporting. `next` matching is anchored, so
 *   `/sign-in?next=/dashboard` and `?next=/settings/invite/x` keep reporting.
 *
 * ## What failure looks like
 *
 * Nothing errors. The token just appears in GA's page-path or referrer
 * reports, where anyone with access to the property — shared across products
 * for Ko-fi attribution — can read it. `tests/google-analytics-gate.test.tsx`
 * is the only place this turns red. The other direction matters too: gating a
 * normal path (or every path) off by mistake zeroes its GA traffic and Ko-fi
 * attribution with no error anywhere (see the GA comment in `app/layout.tsx`).
 */
export function GoogleAnalyticsGate({ gaId }: { gaId: string }) {
  return (
    <Suspense fallback={null}>
      <GoogleAnalyticsGateLeaf gaId={gaId} />
    </Suspense>
  )
}

function GoogleAnalyticsGateLeaf({ gaId }: { gaId: string }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const blocked = isTokenBearingUrl(pathname, searchParams?.getAll('next') ?? [])
  const [rendered, setRendered] = useState(!blocked)
  // Derived-state update during render: latches on the first non-blocked URL.
  if (!blocked && !rendered) setRendered(true)
  // Set once a token URL is seen while gtag is loaded; lives until a full load.
  const sticky = useRef(false)

  useInsertionEffect(() => {
    if (blocked && rendered) sticky.current = true
    try {
      ;(window as unknown as Record<string, unknown>)[`ga-disable-${gaId}`] = blocked || sticky.current
    } catch {
      // A locked-down window object must not take the page down.
    }
  }, [gaId, blocked, rendered])

  if (!rendered) return null
  return <GoogleAnalytics gaId={gaId} />
}
