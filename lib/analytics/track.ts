'use client'

import posthog from 'posthog-js'
import { POSTHOG_ENABLED } from '@/app/providers'

/**
 * Single client capture seam. No-op unless PostHog is enabled (prod + key), so
 * dev/test never emit. Components import this (not posthog-js directly) so tests
 * can `vi.mock('@/lib/analytics/track')`.
 */
export function track(event: string, properties?: Record<string, unknown>): void {
  if (!POSTHOG_ENABLED) return
  posthog.capture(event, properties)
}

/** Current anonymous distinct_id, to hand to the OAuth callback for aliasing. */
export function getAnonId(): string | undefined {
  if (!POSTHOG_ENABLED) return undefined
  return posthog.get_distinct_id()
}
