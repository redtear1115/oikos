/**
 * A real Sentry Node client wired the way `sentry.server.config.ts` wires it
 * (enableLogs + consoleLoggingIntegration + the shared scrub hooks), with a
 * transport that keeps every envelope in memory instead of sending it.
 *
 * Use it when a test must see what would actually leave the process — the
 * SDK's own formatting (e.g. `console.error(err)` becomes
 * `JSON.stringify(normalize(err))` in a Node process, where `util` is not on
 * globalThis) happens after the hooks and is easy to get wrong in a
 * hand-built event.
 *
 * Call from a file that runs in the `node` vitest environment.
 */
import * as Sentry from '@sentry/node'
import { createTransport, _INTERNAL_flushLogsBuffer } from '@sentry/core'
import {
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  scrubSentryLog,
  scrubSentrySpan,
} from '@/lib/observability/sentryScrub'

export interface SentryHarness {
  /** Every envelope sent so far, decoded to text. */
  envelopes: string[]
  /** Flush logs and events, then return the envelopes. */
  drain(): Promise<string[]>
  close(): Promise<void>
}

export function startSentryHarness(): SentryHarness {
  const envelopes: string[] = []
  const decoder = new TextDecoder()
  const client = Sentry.init({
    dsn: 'https://public@o0.ingest.sentry.io/0',
    defaultIntegrations: false,
    integrations: [
      Sentry.consoleIntegration(),
      Sentry.consoleLoggingIntegration({ levels: ['error', 'warn'] }),
    ],
    enableLogs: true,
    sendDefaultPii: false,
    beforeSend: scrubSentryEvent,
    beforeSendTransaction: scrubSentryEvent,
    beforeSendSpan: scrubSentrySpan,
    beforeBreadcrumb: scrubSentryBreadcrumb,
    beforeSendLog: scrubSentryLog,
    transport: (options) =>
      createTransport(options, async (request) => {
        envelopes.push(typeof request.body === 'string' ? request.body : decoder.decode(request.body))
        return { statusCode: 200 }
      }),
  })
  if (!client) throw new Error('Sentry.init returned no client')

  return {
    envelopes,
    async drain() {
      _INTERNAL_flushLogsBuffer(client)
      await Sentry.flush(2000)
      return envelopes
    },
    async close() {
      await Sentry.close(2000)
    },
  }
}
