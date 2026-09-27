import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #1453 — the database layer cleans every error thrown through `db`
 * (`lib/db/sanitizingQuery.ts`). These are the ways around it that a grep can
 * see. None of them errors when it happens; the bound values just show up
 * again in the Vercel log or in Sentry.
 *
 * - a raw postgres.js client (`db.$client`, a second `postgres(...)`): its
 *   errors never pass through Drizzle;
 * - Drizzle's `logger` option: logs every query WITH its parameters;
 * - postgres.js' `debug` option: makes the hidden `query` / `parameters` /
 *   `args` on every error enumerable (and logs each query);
 * - Sentry's `includeLocalVariables` / `extraErrorDataIntegration`: copy
 *   local variables / every own property of an error into the event.
 *
 * And the tests that prove the Sentry hooks (the second line) work on RAW
 * driver errors must really see raw errors: once `lib/db/client` is imported,
 * the wrap is on drizzle's prototype for the whole test file, and every error
 * a drizzle instance throws arrives already clean — the test would pass
 * while proving nothing. So those files either never import `lib/db/client`,
 * or build the raw error by hand (`client.unsafe(...)` + `new
 * DrizzleQueryError(...)`).
 */

/** Application code: what ships. Scripts and tests are not. */
const APP_ROOTS = ['actions', 'app', 'components', 'lib']
const APP_FILES_AT_ROOT = [
  'proxy.ts',
  'instrumentation.ts',
  'instrumentation-client.ts',
  'sentry.server.config.ts',
  'sentry.edge.config.ts',
  'next.config.ts',
]

function appFiles(): string[] {
  const listed = execFileSync('git', ['ls-files', '--', ...APP_ROOTS, ...APP_FILES_AT_ROOT], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  return listed.split('\n').filter((f) => /\.(?:ts|tsx|js|mjs|cjs)$/.test(f))
}

function read(file: string): string {
  return readFileSync(join(process.cwd(), file), 'utf8')
}

/** Comments stripped, so a mention in prose neither trips nor satisfies a check. */
function code(file: string): string {
  return read(file)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function offenders(re: RegExp, files = appFiles()): string[] {
  return files.filter((f) => re.test(code(f)))
}

describe('no way around the database layer in application code', () => {
  it('finds the application files (control)', () => {
    const files = appFiles()
    expect(files).toContain('lib/db/client.ts')
    expect(files.length).toBeGreaterThan(100)
  })

  it('no raw client: `$client` is never used', () => {
    expect(offenders(/\$client\b/)).toEqual([])
  })

  it('only lib/db/client.ts imports postgres.js or builds a drizzle instance', () => {
    expect(offenders(/from\s+['"]postgres['"]|require\(\s*['"]postgres['"]\s*\)/)).toEqual(['lib/db/client.ts'])
    expect(offenders(/\bdrizzle\s*\(/)).toEqual(['lib/db/client.ts'])
  })

  it('no drizzle query logger, no postgres.js debug', () => {
    const client = code('lib/db/client.ts')
    expect(client).not.toMatch(/\blogger\s*:/)
    expect(client).not.toMatch(/\bdebug\s*:/)
    expect(offenders(/\bDefaultLogger\b|\blogQuery\b/)).toEqual([])
  })

  it('no Sentry option that copies locals or error properties into events', () => {
    expect(offenders(/includeLocalVariables|extraErrorDataIntegration|localVariablesIntegration/)).toEqual([])
  })

  it('lib/db/client.ts installs the wrap before building db, and keeps notices to their names', () => {
    const client = code('lib/db/client.ts')
    const install = client.indexOf('installDbErrorSanitizer()')
    expect(install).toBeGreaterThan(-1)
    expect(install).toBeLessThan(client.indexOf('drizzle('))
    expect(client).toMatch(/onnotice:/)
    const notice = client.slice(client.indexOf('onnotice:'), client.indexOf('export const db'))
    expect(notice).toMatch(/severity: notice\.severity/)
    expect(notice).not.toMatch(/notice\.(?:message|detail|where|hint)|console\.\w+\([^)]*\bnotice\s*[,)]/)
  })

  it('the wrap module exports no way to undo it', () => {
    const source = code('lib/db/sanitizingQuery.ts')
    const exported = [...source.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/g)].map((m) => m[1]).sort()
    expect(exported).toEqual(['DB_ERROR_SANITIZER_MARK', 'installDbErrorSanitizer'])
    expect(source).not.toMatch(/export\s*\{|export\s+default/)
  })
})

describe('second-line Sentry tests see raw driver errors', () => {
  const NEVER_IMPORT_DB_CLIENT = [
    '__tests__/actions/sentryFrameScrub1451.test.ts',
    'tests/sentry-db-error-envelope.test.ts',
    'tests/sentry-frame-scrub.test.ts',
    'tests/sentry-scrub-edges.test.ts',
    'tests/sentry-scrub.test.ts',
  ]

  it.each(NEVER_IMPORT_DB_CLIENT)('%s never imports lib/db/client or the wrap', (file) => {
    const source = code(file)
    expect(source).not.toMatch(/lib\/db\/client|lib\/db\/sanitizingQuery/)
  })

  it('sentryDbErrorEnvelope builds its raw errors by hand (it imports lib/db/client for seeding)', () => {
    const source = code('__tests__/actions/sentryDbErrorEnvelope.test.ts')
    expect(source).toMatch(/lib\/db\/client/)
    expect(source).toMatch(/new DrizzleQueryError\(/)
    expect(source).toMatch(/\.unsafe\(/)
  })
})
