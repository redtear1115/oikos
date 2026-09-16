import * as Sentry from '@sentry/nextjs'
import { DEPLOY_ENV, IS_PROD_DEPLOY } from '@/lib/deployEnv'
import {
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  scrubSentryLog,
  scrubSentrySpan,
} from '@/lib/observability/sentryScrub'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  // The deployment, not the build mode — a local `next build && next start`
  // is also NODE_ENV=production and used to report itself as prod (#1116,
  // see lib/deployEnv.ts).
  environment: DEPLOY_ENV,
  enabled: IS_PROD_DEPLOY,
  tracesSampleRate: 0.1,
  // Send structured logs to Sentry → Logs. consoleLoggingIntegration forwards
  // console.error/warn so existing logging shows up without Sentry.logger calls.
  enableLogs: true,
  integrations: [
    Sentry.consoleLoggingIntegration({ levels: ['error', 'warn'] }),
    // #1274 — same integration the SDK installs by default, minus cookies
    // (this also strips the raw `cookie` header before it is read). The SDK
    // de-duplicates integrations by name and a user instance replaces the
    // default one, so this is not a second RequestData. The scrub hooks below
    // still delete cookies / headers as the second line.
    Sentry.requestDataIntegration({ include: { cookies: false } }),
  ],
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
