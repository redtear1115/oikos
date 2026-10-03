import type { captureRouterTransitionStart } from '@/lib/observability/sentryClient'
import { isPublicLocalizedPath } from '@/lib/i18n/path'
import { whenIdle } from '@/lib/whenIdle'

// The Sentry client SDK (config, scrubbers, platform tag) lives in
// lib/observability/sentryClient.ts and is loaded from here by dynamic import,
// so it is not part of the initial bundle (#1520). Timing:
// - public brand pages (the `isPublicLocalizedPath` set): after load + idle, so
//   the SDK never competes with first paint. Errors thrown before that are not
//   captured — the trade accepted for the LCP.
// - everything else (dashboard, invite, setup…): immediately at boot, as before.
//   The dynamic import adds one chunk round-trip, not an idle wait.
// The init config is asserted by tests/sentry-scrub-wiring.test.ts against
// sentryClient.ts; if the scrub hooks are dropped nothing errors — raw URLs
// just reappear in Sentry.
let capture: typeof captureRouterTransitionStart | undefined

const load = () => {
  void import('@/lib/observability/sentryClient').then((m) => {
    capture = m.captureRouterTransitionStart
  })
}

if (isPublicLocalizedPath(window.location.pathname)) whenIdle(load)
else load()

// Required by the Sentry Next.js SDK (v9+) to instrument client-side
// App Router navigations. A no-op until the SDK has loaded — navigations in
// that window just go unrecorded; without this export Next logs a build warning.
export const onRouterTransitionStart: typeof captureRouterTransitionStart = (...args) =>
  capture?.(...args)
