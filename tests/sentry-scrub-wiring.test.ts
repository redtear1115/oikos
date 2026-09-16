import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #1274 — the scrub in `lib/observability/sentryScrub.ts` only protects the
 * runtimes whose `Sentry.init` wires it. An unwired hook does not error: raw
 * URLs, cookies and client IPs just show up in Sentry again. So each of the
 * three configs must import the shared hooks and set every hook key to them,
 * and none may define its own inline version.
 */

const CONFIGS = ['instrumentation-client.ts', 'sentry.server.config.ts', 'sentry.edge.config.ts']

const HOOKS: Array<[key: string, fn: string]> = [
  ['beforeSend', 'scrubSentryEvent'],
  ['beforeSendTransaction', 'scrubSentryEvent'],
  ['beforeSendSpan', 'scrubSentrySpan'],
  ['beforeBreadcrumb', 'scrubSentryBreadcrumb'],
  ['beforeSendLog', 'scrubSentryLog'],
]

function read(file: string): string {
  // Comments stripped so a commented-out line cannot satisfy the check.
  return readFileSync(join(process.cwd(), file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe.each(CONFIGS)('%s', file => {
  const source = read(file)

  it('initializes Sentry exactly once', () => {
    expect(source.match(/Sentry\.init\(/g)).toHaveLength(1)
  })

  it('imports the shared scrub hooks', () => {
    expect(source).toMatch(/from '@\/lib\/observability\/sentryScrub'/)
  })

  it.each(HOOKS)('sets %s to %s', (key, fn) => {
    const matches = source.match(new RegExp(`\\b${key}\\b`, 'g')) ?? []
    expect(matches).toHaveLength(1)
    expect(source).toMatch(new RegExp(`\\b${key}: ${fn},`))
  })
})

describe('sentry.server.config.ts', () => {
  it('keeps cookies and request bodies out of requestDataIntegration', () => {
    expect(read('sentry.server.config.ts')).toMatch(
      /Sentry\.requestDataIntegration\(\{ include: \{ cookies: false, data: false \} \}\)/,
    )
  })
})
