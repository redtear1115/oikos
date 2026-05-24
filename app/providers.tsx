'use client'

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'
import { useEffect } from 'react'

/**
 * PostHog only runs in production with a key configured. This keeps local dev
 * (and any environment missing the key) from initializing PostHog and sending
 * events to the real project — and avoids the "initialized without a token"
 * warning when the key isn't set. Build-time constant, so it's identical on the
 * server and client (no hydration mismatch from the conditional below).
 */
export const POSTHOG_ENABLED =
  process.env.NODE_ENV === 'production' && !!process.env.NEXT_PUBLIC_POSTHOG_KEY

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!POSTHOG_ENABLED) return
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
      // Route ingestion through our managed reverse proxy so ad/tracker
      // blockers don't drop events. Falls back to the proxy domain if the env
      // var is unset, so prod is correct-by-default even before Vercel is set.
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://e.southern-light.dev',
      // Required whenever api_host is a proxy: tells PostHog where the real app
      // lives so dashboard deep-links (toolbar, replay) point back correctly.
      ui_host: 'https://us.posthog.com',
      person_profiles: 'identified_only',
      // Cookieless mode — no consent banner needed
      persistence: 'memory',
      capture_pageview: false, // manual pageview below
      capture_pageleave: true,
    })
  }, [])

  if (!POSTHOG_ENABLED) return <>{children}</>
  return <PHProvider client={posthog}>{children}</PHProvider>
}
