'use client'

import type { PostHog } from 'posthog-js'
import { POSTHOG_ENABLED } from '@/lib/analytics/enabled'

/** Hard cap on the pre-init queue. See `track()` for the reasoning. */
const MAX_QUEUE_SIZE = 50

type QueuedEvent = { event: string; properties?: Record<string, unknown> }

/**
 * Where the page was when the event was recorded. A queued event is sent later,
 * and posthog-js stamps `$current_url` / `$pathname` / `$host` / `$referrer`
 * from `window.location` at *capture* time — so on the brand pages (#1520),
 * where init waits for idle, a `landing_cta_clicked` or the landing `$pageview`
 * that was followed by a client-side navigation to /sign-in went out with
 * `$pathname=/sign-in`. Failure looks like nothing: events arrive normally,
 * the page column is just wrong (CTA clicks attributed to the sign-in page).
 *
 * Caller-supplied properties win over this (the pageview passes its own
 * sanitized `$current_url`), and posthog-js lets event properties override its
 * defaults. The values are raw here; they pass through `before_send`
 * (`scrubAnalyticsUrls`), which masks any key ending in `url` / `pathname` /
 * `referrer` on the final event, so invite tokens and filter values are
 * scrubbed the same as for a live capture. `$host` is a bare hostname.
 */
function captureLocation(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const { href, pathname, host } = window.location
  return {
    $current_url: href,
    $pathname: pathname,
    $host: host,
    $referrer: document.referrer || '$direct',
  }
}

// Module-level state: events fired before `posthog.init()` has run (e.g. from a
// child component's on-mount effect — effects fire child-before-parent, and
// `PostHogProvider`'s init lives in a parent effect) land here instead of
// hitting an uninitialized `posthog.capture()`, which silently no-ops (#1014).
let queue: QueuedEvent[] = []
let initialized = false
// Set by `flushQueue()`. posthog-js is NOT imported here: it is loaded lazily by
// `PostHogProvider` (#1520) so it stays out of the initial bundle of the public
// brand pages, and this module is imported by nearly every component.
let client: PostHog | null = null
let requestInit: (() => void) | null = null
let ready: Promise<void>
let markReady: () => void
const resetReady = () => {
  ready = new Promise<void>((resolve) => {
    markReady = resolve
  })
}
resetReady()

/** `PostHogProvider` registers how to start loading posthog-js, for `analyticsReady()`. */
export function registerAnalyticsInit(start: () => void): void {
  requestInit = start
}

/**
 * Resolves once PostHog is initialized, or after `timeoutMs`, whichever is
 * first — and asks for the load to start now if it was still waiting for idle.
 * For the one caller that needs a live instance on a user action (`getAnonId()`
 * at OAuth start); everything else just uses the queue.
 */
export function analyticsReady(timeoutMs: number): Promise<void> {
  if (!POSTHOG_ENABLED || initialized) return Promise.resolve()
  requestInit?.()
  return Promise.race([ready, new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))])
}

/**
 * Single client capture seam. No-op unless PostHog is enabled (prod + key), so
 * dev/test never emit. Components import this (not posthog-js directly) so tests
 * can `vi.mock('@/lib/analytics/track')`.
 *
 * Before `flushQueue()` has been called (see `PostHogProvider` in
 * `app/providers.tsx`), events are queued in memory rather than sent — sending
 * them straight to `posthog.capture()` before `init()` runs is a silent no-op.
 */
export function track(event: string, properties?: Record<string, unknown>): void {
  if (!POSTHOG_ENABLED) return

  if (!initialized) {
    queue.push({ event, properties: { ...captureLocation(), ...properties } })
    // Cap instead of dropping outright: init can legitimately race a fast
    // on-mount `track()` call, so a couple of queued events is normal and
    // fine to keep. Only trim if genuinely unbounded (see below).
    if (queue.length > MAX_QUEUE_SIZE) queue.shift()
    return
  }

  client?.capture(event, properties)
}

/**
 * Hands over the initialized PostHog instance and flushes any events queued before, in the
 * order they were recorded. Must be called by `PostHogProvider` *after*
 * `posthog.init()` and `posthog.register()` — flushing before `register()`
 * would send the queued events without the `platform` / `is_native` super
 * properties, which is worse than not sending them at all (looks fixed, data
 * is silently missing a dimension). See `app/providers.tsx` for the call site
 * and why it must run unconditionally in that effect.
 *
 * Idempotent: once flushed, the queue is empty, so calling this again is a
 * no-op. Never call this by watching PostHog's own `loaded` state (polling
 * `__loaded`, an init `loaded` callback, etc.) — the ordering guarantee this
 * function depends on only holds if the provider calls it explicitly, in the
 * right place, once.
 *
 * No timeout / expiry on queued events by design: the queue lives only as
 * long as the page does, and is capped at `MAX_QUEUE_SIZE`, which already
 * bounds the worst case (init never succeeding — e.g. a tracker blocker
 * killing the proxy request) to 50 in-memory objects for the tab's lifetime.
 * A timer would add a moving part without reducing that already-bounded risk.
 */
export function flushQueue(posthog: PostHog): void {
  client = posthog
  initialized = true
  markReady()
  if (queue.length === 0) return

  const pending = queue
  queue = []
  for (const { event, properties } of pending) {
    posthog.capture(event, properties)
  }
}

/**
 * Current anonymous distinct_id, to hand to the OAuth callback for aliasing.
 *
 * Must only be called after a user interaction (e.g. from a click handler),
 * never from an on-mount effect: `posthog.get_distinct_id()` before `init()`
 * has run is just as unreliable as `capture()` is (see `track()` above), but
 * unlike `track()` this returns a value rather than firing an event, so it
 * can't be queued and replayed later — an on-mount caller would silently get
 * `undefined` back, which breaks OAuth aliasing rather than just dropping an
 * event. The current sole call site, `SignInButton`, is safe because every
 * call happens inside `handleSignIn`, itself only invoked from `onClick`.
 */
export function getAnonId(): string | undefined {
  if (!POSTHOG_ENABLED) return undefined
  return client?.get_distinct_id()
}
