import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  // Only send errors in production to keep free-tier quota
  enabled: process.env.NODE_ENV === 'production',
  tracesSampleRate: 0.1,
  // Privacy: scrub PII before sending
  beforeSend(event) {
    // Remove user IP and sensitive request data
    if (event.request) {
      delete event.request.cookies
      delete event.request.headers
    }
    return event
  },
})

// Required by the Sentry Next.js SDK (v9+) to instrument client-side
// App Router navigations. Without this export the SDK logs a build warning.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
