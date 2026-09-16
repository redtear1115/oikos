// #1274 — source-level guard for the two URL-scrub call sites that no
// behavioural test would notice going away: the manual PostHog pageview and
// the Vercel Analytics / Speed Insights mount. If either regresses, nothing
// errors — raw URLs (invite tokens, ledger filter values) simply reach the
// third-party tool again.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..')
const read = (p: string) =>
  readFileSync(join(root, p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('analytics URL scrub wiring', () => {
  it('PostHogPageView passes a sanitized $current_url', () => {
    const src = read('app/posthog-pageview.tsx')
    expect(src).toMatch(/from ['"]@\/lib\/analytics\/urlSanitizer['"]/)
    expect(src).toMatch(/\$current_url:\s*sanitizeAnalyticsUrl\(/)
  })

  it('layout mounts Vercel Analytics / Speed Insights only through the scrubbing wrapper', () => {
    const layout = read('app/layout.tsx')
    expect(layout).not.toMatch(/@vercel\/analytics/)
    expect(layout).not.toMatch(/@vercel\/speed-insights/)
    expect(layout).toMatch(/<VercelInsights\s*\/>/)
  })

  it('no other app/components file mounts the Vercel components directly', () => {
    const tsx = (dir: string) =>
      (readdirSync(join(root, dir), { recursive: true }) as string[])
        .filter((f) => f.endsWith('.tsx'))
        .map((f) => join(dir, f))
    const files = [...tsx('app'), ...tsx('components')].filter(
      (f) => f !== join('app', 'vercel-insights.tsx'),
    )
    const offenders = files.filter((f) => /@vercel\/(analytics|speed-insights)/.test(read(f)))
    expect(offenders).toEqual([])
  })
})
