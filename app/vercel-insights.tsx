'use client'

import { Analytics, type BeforeSendEvent as AnalyticsBeforeSendEvent } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { REDACTED_URL, sanitizeAnalyticsUrl } from '@/lib/analytics/urlSanitizer'

// `@vercel/speed-insights/next` doesn't export its `BeforeSendEvent` type
// (only the `SpeedInsights` component itself), so it's reproduced here from
// `node_modules/@vercel/speed-insights/dist/next/index.d.ts` (2.0.0). Keep
// this in sync if the package's shape changes — a mismatch would only show
// up as a type error here, not a runtime failure.
interface SpeedInsightsBeforeSendEvent {
  type: 'vital'
  url: string
  route?: string
}

/**
 * #1274 — scrub the page URL out of Vercel Web Analytics and Speed Insights
 * before either leaves the browser.
 *
 * ## Why this exists
 *
 * Both SDKs' `beforeSend` receives an event carrying the page's own `url`
 * (query included), which is enough to leak an invite token
 * (`/invite/<token>`, `?next=/invite/<token>`) or a ledger filter value
 * (`/records?fAmtMin=…`). Rules are the shared ones from
 * `lib/analytics/urlSanitizer.ts`.
 *
 * ## Contract
 *
 * - `beforeSend` is defined **once, at module scope**, not inside the
 *   component. Both SDKs re-subscribe `beforeSend` in a `useEffect` keyed on
 *   the prop's identity (see their `index.mjs`); a function recreated every
 *   render would re-register on every render for no benefit. A stable
 *   reference also makes the two exports here trivially the same function
 *   across renders/instances, which the guardrail test checks.
 * - **Never returns `null`/`undefined`/`false`.** Both SDKs treat a falsy
 *   return as "drop this event" (`@vercel/analytics`'s `BeforeSend` returns
 *   `BeforeSendEvent | null`; `@vercel/speed-insights`'s also accepts
 *   `undefined | false`) — so returning nothing on our own error would
 *   silently zero out every pageview/vital instead of just failing to
 *   sanitize this one. On any internal failure we swap `url` for
 *   {@link REDACTED_URL} and still return the event.
 * - If sanitizing yields `''` (empty input, or a URL that reduces to
 *   nothing), we still send {@link REDACTED_URL} rather than `''` — neither
 *   SDK's public types document `''` as valid, and it does not read as a
 *   real event; a fixed placeholder can't leak anything and is a cheap way
 *   to see this path fire in Vercel's dashboard if it ever does.
 * - `event.url` is read at most once. A malformed event whose `url` is an
 *   accessor that throws on every read (not just the first) would make a
 *   naive `{ ...event, url: safe }` throw again while re-spreading `event`
 *   in the `catch` — the object literal evaluates every source property,
 *   `url` included, before the explicit `url:` overrides it. So the
 *   fallback path never re-reads `event.url`: it copies the event's other
 *   own keys individually (each guarded on its own, so one more hostile
 *   getter still can't take the whole event down) and sets `url` directly.
 *
 * ## What failure looks like
 *
 * Nothing errors, and nothing looks obviously broken in dev — both SDKs are
 * only active in production anyway. If a rewrite of this file ever passes
 * `event.url` straight through, or wires a fresh inline function that swaps
 * per render, the raw URL — token and filter values included — simply
 * reappears in Vercel's Insights / Speed Insights dashboards under "Top
 * Pages" and nobody looks there. `tests/vercel-insights-scrub.test.tsx` is
 * the only place this turns red.
 */
function sanitizeEventUrl<T extends { url: string }>(event: T): T {
  try {
    const url = sanitizeAnalyticsUrl(event.url)
    return { ...event, url: url === '' ? REDACTED_URL : url }
  } catch {
    return { ...safeSpreadExcludingUrl(event), url: REDACTED_URL } as T
  }
}

/**
 * Copies every own enumerable key of `event` except `url`, tolerating a
 * hostile accessor on any individual key (skips that key rather than
 * throwing). Used only on the error path, where `event.url` has already
 * proven unsafe to read again.
 */
function safeSpreadExcludingUrl(event: object): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(event)) {
    if (key === 'url') continue
    try {
      out[key] = (event as Record<string, unknown>)[key]
    } catch {
      // Drop the key rather than let one bad accessor abort the whole event.
    }
  }
  return out
}

export function analyticsBeforeSend(event: AnalyticsBeforeSendEvent): AnalyticsBeforeSendEvent {
  return sanitizeEventUrl(event)
}

export function speedInsightsBeforeSend(
  event: SpeedInsightsBeforeSendEvent,
): SpeedInsightsBeforeSendEvent {
  return sanitizeEventUrl(event)
}

export function VercelInsights() {
  return (
    <>
      <Analytics beforeSend={analyticsBeforeSend} />
      <SpeedInsights beforeSend={speedInsightsBeforeSend} />
    </>
  )
}
