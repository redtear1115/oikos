import * as Sentry from '@sentry/nextjs'
import { detectPlatform } from '@/lib/platform'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  // Only send errors in production to keep free-tier quota
  enabled: process.env.NODE_ENV === 'production',
  tracesSampleRate: 0.1,
  // Send structured logs to Sentry → Logs. consoleLoggingIntegration forwards
  // console.error/warn so existing logging shows up without Sentry.logger calls.
  enableLogs: true,
  integrations: [Sentry.consoleLoggingIntegration({ levels: ['error', 'warn'] })],
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

// #1002 — every client error gets a platform tag. Without it the three surfaces
// are indistinguishable in Sentry: 30 days of production errors came back with
// empty `os.name` / `browser.name`, and even an Apple-Sign-In failure that can
// only originate in the iOS shell couldn't be attributed to it.
//
// Safe with `enabled: false` (dev): `setTag` only writes to the current scope,
// and a disabled client sends nothing — so this adds no dev noise and no
// failure mode of its own. Client config only; server and edge have no platform
// to report.
const platform = detectPlatform()
if (platform) Sentry.setTag('platform', platform)

// Required by the Sentry Next.js SDK (v9+) to instrument client-side
// App Router navigations. Without this export the SDK logs a build warning.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
