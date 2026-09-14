import * as Sentry from '@sentry/nextjs'
import { DEPLOY_ENV, IS_PROD_DEPLOY } from '@/lib/deployEnv'

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
  integrations: [Sentry.consoleLoggingIntegration({ levels: ['error', 'warn'] })],
})
