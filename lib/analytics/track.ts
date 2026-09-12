'use client'

import posthog from 'posthog-js'
import { POSTHOG_ENABLED } from '@/app/providers'

/** Hard cap on the pre-init queue. See `track()` for the reasoning. */
const MAX_QUEUE_SIZE = 50

type QueuedEvent = { event: string; properties?: Record<string, unknown> }

// Module-level state: events fired before `posthog.init()` has run (e.g. from a
// child component's on-mount effect — effects fire child-before-parent, and
// `PostHogProvider`'s init lives in a parent effect) land here instead of
// hitting an uninitialized `posthog.capture()`, which silently no-ops (#1014).
let queue: QueuedEvent[] = []
let initialized = false

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
    queue.push({ event, properties })
    // Cap instead of dropping outright: init can legitimately race a fast
    // on-mount `track()` call, so a couple of queued events is normal and
    // fine to keep. Only trim if genuinely unbounded (see below).
    if (queue.length > MAX_QUEUE_SIZE) queue.shift()
    return
  }

  posthog.capture(event, properties)
}

/**
 * Flushes any events queued before PostHog finished initializing, in the
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
export function flushQueue(): void {
  initialized = true
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
  return posthog.get_distinct_id()
}
