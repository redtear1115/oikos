import * as Sentry from '@sentry/nextjs'
import { detectPlatform } from '@/lib/platform'
import { DEPLOY_ENV, IS_PROD_DEPLOY } from '@/lib/deployEnv'
import {
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  scrubSentryLog,
  scrubSentrySpan,
} from '@/lib/observability/sentryScrub'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // The deployment, not the build mode. `NODE_ENV` filed local prod builds and
  // preview deployments under `environment: production` too — 84 of 85 events
  // in the prod feed turned out to be localhost (#1116, see lib/deployEnv.ts).
  environment: DEPLOY_ENV,
  // Only send errors from the production deployment, to keep free-tier quota
  enabled: IS_PROD_DEPLOY,
  tracesSampleRate: 0.1,
  // Send structured logs to Sentry → Logs. consoleLoggingIntegration forwards
  // console.error/warn so existing logging shows up without Sentry.logger calls.
  enableLogs: true,
  integrations: [Sentry.consoleLoggingIntegration({ levels: ['error', 'warn'] })],
  // #1274 — every payload the SDK sends goes through the shared scrub:
  // invite tokens and ledger filter values out of URLs, cookies / headers /
  // client IPs removed. Transactions skip `beforeSend`, so each hook is
  // needed. If one is dropped nothing errors — raw URLs just reappear in
  // Sentry (tests/sentry-scrub-wiring.test.ts guards this).
  beforeSend: scrubSentryEvent,
  beforeSendTransaction: scrubSentryEvent,
  beforeSendSpan: scrubSentrySpan,
  beforeBreadcrumb: scrubSentryBreadcrumb,
  beforeSendLog: scrubSentryLog,
})

// #1002 — every client error gets a platform tag. Without it the three surfaces
// are indistinguishable in Sentry: 30 days of production errors came back with
// empty `os.name` / `browser.name`, and even an Apple-Sign-In failure that can
// only originate in the iOS shell couldn't be attributed to it.
//
// Safe with `enabled: false` (local / preview): `setTag` only writes to the
// current scope, and a disabled client sends nothing — so this adds no noise
// and no failure mode of its own. Client config only; server and edge have no
// platform to report.
const platform = detectPlatform()
if (platform) Sentry.setTag('platform', platform)

// Required by the Sentry Next.js SDK (v9+) to instrument client-side
// App Router navigations. Without this export the SDK logs a build warning.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
