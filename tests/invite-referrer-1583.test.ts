// @vitest-environment node
import { describe, it, expect } from 'vitest'
// Next's own matchers — the ones the router uses for next.config headers()
// (server/lib/router-utils/resolve-routes.js: route.match(pathname), then
// matchHas(req, parseUrl(req.url).query, route.has)), so this fails if a source
// or a `has` regex doesn't match the way we think it does.
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match'
import { matchHas } from 'next/dist/shared/lib/router/utils/prepare-destination'
import { parseUrl } from 'next/dist/shared/lib/router/utils/parse-url'
import { headerRules, INVITE_REFERRER_RULES } from '@/next.config'
import { hasTokenBearingNext, TOKEN_BEARING_NEXT_PATTERN } from '@/lib/analytics/tokenBearingUrl'
import { SUPPORTED_LOCALES } from '@/lib/i18n/locales-meta'

// #1583: the invite token is a bearer secret in `/invite/<token>`, and the
// signed-out bounce `/<locale>/sign-in?next=/invite/<token>` holds it in its
// query. Both must send `Referrer-Policy: no-referrer`, so the next page's
// document.referrer (→ GA `dr`) does not carry it. Failure looks like nothing:
// pages render the same; the token shows up as a referrer in GA.

const TOKEN = 'A'.repeat(43)

type Rule = (typeof headerRules)[number] & { has?: Parameters<typeof matchHas>[2] }

function headersFor(url: string): Record<string, string> {
  const parsed = parseUrl(url)
  const req = { headers: {} } as unknown as Parameters<typeof matchHas>[0]
  const out: Record<string, string> = {}
  for (const rule of headerRules as Rule[]) {
    const match = getPathMatch(rule.source, { strict: true, removeUnnamedParams: true, sensitive: false })
    if (!match(parsed.pathname)) continue
    if (rule.has && !matchHas(req, parsed.query, rule.has, undefined)) continue
    for (const x of rule.headers) out[x.key.toLowerCase()] = x.value
  }
  return out
}

const NO_REFERRER = [
  `/invite/${TOKEN}`,
  `/sign-in?next=/invite/${TOKEN}`,
  `/sign-in?next=%2Finvite%2F${TOKEN}&from=invite`, // as app/invite redirects
  `/sign-in?from=invite&next=%2Finvite%2F${TOKEN}`,
  ...SUPPORTED_LOCALES.map((l) => `/${l}/sign-in?next=/invite/${TOKEN}&from=invite`),
  `/zh-TW/sign-in?next=%2Finvite%2F${TOKEN}`,
  `/ja/sign-in?next=/zh-TW/invite/${TOKEN}`,
  `/en/sign-in?next=/outing/${TOKEN}`,
]

const DEFAULT_POLICY = [
  '/',
  '/zh-TW',
  '/sign-in',
  '/zh-TW/sign-in',
  '/sign-in?from=invite', // `from` alone carries no token
  '/sign-in?next=/dashboard',
  '/sign-in?next=%2Fdashboard',
  '/en/sign-in?next=/settings/invite/x',
  '/sign-in?next=https://evil.example/invite/x',
  '/sign-in?next=/invite',
  '/sign-in?next=/invite/',
  '/terms',
  '/dashboard',
  '/xx/sign-in?next=/invite/abc', // not a locale route
]

describe('invite token pages — Referrer-Policy (#1583)', () => {
  it.each(NO_REFERRER)('%s → no-referrer', (url) => {
    expect(headersFor(url)['referrer-policy']).toBe('no-referrer')
  })

  it.each(DEFAULT_POLICY)('%s → no Referrer-Policy header', (url) => {
    expect(headersFor(url)['referrer-policy']).toBeUndefined()
  })

  it('invite keeps its frame-deny headers (#1535) alongside', () => {
    const h = headersFor(`/invite/${TOKEN}`)
    expect(h['x-frame-options']).toBe('DENY')
    expect(h['content-security-policy']).toBe("frame-ancestors 'none'")
  })

  it('the header rule and the in-app predicate share one pattern', () => {
    const fromRules = INVITE_REFERRER_RULES.flatMap((r) => ('has' in r ? r.has.map((h) => h.value) : []))
    expect(fromRules).toEqual([TOKEN_BEARING_NEXT_PATTERN, TOKEN_BEARING_NEXT_PATTERN])
  })

  // Next's has-matcher reads only the LAST value of a repeated param; the
  // sign-in flow reads the first. The metadata layer (hasTokenBearingNext)
  // checks all of them, so a repeated `next` is still covered by the
  // <meta name="referrer"> tag.
  it('a repeated next: header follows the last value, the metadata layer any value', () => {
    expect(headersFor(`/sign-in?next=/invite/${TOKEN}&next=/dashboard`)['referrer-policy']).toBeUndefined()
    expect(hasTokenBearingNext([`/invite/${TOKEN}`, '/dashboard'])).toBe(true)
  })
})
