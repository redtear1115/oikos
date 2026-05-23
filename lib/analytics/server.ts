import { PostHog } from 'posthog-node'

// Mirror the client gate (app/providers.tsx) without importing the 'use client'
// module into server code. NEXT_PUBLIC_* vars are available server-side too.
const SERVER_ANALYTICS_ENABLED =
  process.env.NODE_ENV === 'production' && !!process.env.NEXT_PUBLIC_POSTHOG_KEY

let client: PostHog | null = null

function getClient(): PostHog | null {
  if (!SERVER_ANALYTICS_ENABLED) return null
  if (!client) {
    client = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
      // Serverless: send each event immediately, then flush() before the
      // function freezes. No background batching to lose.
      flushAt: 1,
      flushInterval: 0,
    })
  }
  return client
}

/**
 * Server-side capture keyed on a stable distinctId (the auth user id). Never
 * throws — analytics must not break a write path. `setOnce` writes person
 * properties that won't overwrite an existing value (e.g. first-touch source).
 */
export async function captureServer(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>,
  setOnce?: Record<string, unknown>,
): Promise<void> {
  const ph = getClient()
  if (!ph) return
  try {
    ph.capture({
      distinctId,
      event,
      properties: { ...properties, ...(setOnce ? { $set_once: setOnce } : {}) },
    })
    await ph.flush()
  } catch {
    // swallow — never let analytics failures surface to the caller
  }
}

/** Merge an anonymous distinct_id into the identified user. Never throws. */
export async function aliasServer(distinctId: string, anonId: string): Promise<void> {
  const ph = getClient()
  if (!ph) return
  try {
    ph.alias({ distinctId, alias: anonId })
    await ph.flush()
  } catch {
    // swallow
  }
}
