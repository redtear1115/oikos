// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { readdirSync, readFileSync } from 'fs'
import { join, relative } from 'path'
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match'
import { matchHas } from 'next/dist/shared/lib/router/utils/prepare-destination'
import { headerRules, OUTING_PUBLIC_SOURCES } from '@/next.config'
import robots from '@/app/robots'
import sitemap from '@/app/sitemap'
import { SUPPORTED_LOCALES } from '@/lib/i18n/locales-meta'
import { isOutingPublicPath, isPublicLocalizedPath } from '@/lib/i18n/path'

// #1558 S3: the outing share pages carry a bearer token in the URL.
// Failure looks like nothing: pages render the same, the token just leaks via
// Referer / a shared cache / a search index, or a signed-in friend silently
// shows up as anonymous because the proxy stopped refreshing their session.

const h = vi.hoisted(() => ({
  getUser: vi.fn(async () => ({ data: { user: null as null | { id: string } } })),
}))
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({ auth: { getUser: h.getUser } })),
}))
const { proxy } = await import('@/proxy')

const ORIGIN = 'https://futari.southern-light.dev'
const TOKEN = 'A'.repeat(43)
const ID = '0b0e7d3c-6b7e-4c8e-9a51-2f7d3c6b7e4c'

function headersFor(pathname: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rule of headerRules as Array<(typeof headerRules)[number] & { has?: Parameters<typeof matchHas>[2] }>) {
    const match = getPathMatch(rule.source, { strict: true, removeUnnamedParams: true, sensitive: false })
    if (!match(pathname)) continue
    // Conditional rules (#1583 sign-in `has: next=…`) need their query; these paths have none.
    if (rule.has && !matchHas({ headers: {} } as unknown as Parameters<typeof matchHas>[0], {}, rule.has, undefined)) continue
    for (const x of rule.headers) out[x.key.toLowerCase()] = x.value
  }
  return out
}

const OUTING_PATHS = [
  `/outing/${TOKEN}`,
  `/outing/r/${ID}`,
  ...SUPPORTED_LOCALES.flatMap((l) => [`/${l}/outing/${TOKEN}`, `/${l}/outing/r/${ID}`]),
]

describe('outing share pages — response headers', () => {
  it.each(OUTING_PATHS)('%s: no-referrer, noindex, private no-store, frame-denied', (p) => {
    const x = headersFor(p)
    expect(x['referrer-policy']).toBe('no-referrer')
    expect(x['x-robots-tag']).toBe('noindex, nofollow')
    expect(x['cache-control']).toBe('private, no-store')
    expect(x['content-security-policy']).toBe("frame-ancestors 'none'")
    expect(x['x-frame-options']).toBe('DENY')
  })

  it.each(['/outings', '/outings/abc', '/en/outings', '/xx/outing/abc', '/', '/zh-TW/sign-in'])(
    '%s is not given the outing headers',
    (p) => {
      expect(headersFor(p)['referrer-policy']).toBeUndefined()
      expect(headersFor(p)['x-robots-tag']).toBeUndefined()
    },
  )

  it('sources are the two path forms', () => {
    expect(OUTING_PUBLIC_SOURCES).toHaveLength(2)
  })
})

describe('robots + sitemap', () => {
  const { rules } = robots()
  const rule = Array.isArray(rules) ? rules[0] : rules
  const disallow = ([] as string[]).concat(rule.disallow ?? [])
  const allow = ([] as string[]).concat(rule.allow ?? [])

  it('disallows /outing/ in every locale form, and never the signed-in /outings', () => {
    expect(disallow).toContain('/outing/')
    for (const l of SUPPORTED_LOCALES.filter((x) => x !== 'zh-TW')) expect(disallow).toContain(`/${l}/outing/`)
    expect(disallow.some((d) => d.startsWith('/outings'))).toBe(false)
    expect(allow.some((a) => a.includes('/outing'))).toBe(false)
  })

  it('the sitemap has no outing page', () => {
    expect(sitemap().some((e) => /\/outing(\/|$)/.test(new URL(e.url).pathname))).toBe(false)
  })
})

describe('proxy on outing paths', () => {
  beforeEach(() => {
    h.getUser.mockReset()
    h.getUser.mockResolvedValue({ data: { user: null } })
  })

  it('path helpers: both forms are public-localized and outing; /outings is neither', () => {
    for (const p of OUTING_PATHS) {
      expect(isPublicLocalizedPath(p)).toBe(true)
      expect(isOutingPublicPath(p)).toBe(true)
    }
    expect(isOutingPublicPath('/outings/abc')).toBe(false)
    expect(isPublicLocalizedPath('/outings/abc')).toBe(false)
  })

  it.each([`/outing/${TOKEN}`, `/en/outing/${TOKEN}`, `/ja/outing/r/${ID}`])(
    '%s refreshes the session and never redirects a signed-out visitor',
    async (p) => {
      const res = await proxy(new NextRequest(`${ORIGIN}${p}`))
      expect(h.getUser).toHaveBeenCalledTimes(1)
      expect(res.status).not.toBe(307)
      expect(res.headers.get('location')).toBeNull()
    },
  )

  it('the unprefixed form is rewritten to the default locale', async () => {
    const res = await proxy(new NextRequest(`${ORIGIN}/outing/r/${ID}`))
    expect(res.headers.get('x-middleware-rewrite')).toBe(`${ORIGIN}/zh-TW/outing/r/${ID}`)
  })

  it('other public pages still skip getUser (#920)', async () => {
    await proxy(new NextRequest(`${ORIGIN}/en/sign-in`))
    expect(h.getUser).not.toHaveBeenCalled()
  })

  it('/outings (signed-in list) is still auth-gated', async () => {
    const res = await proxy(new NextRequest(`${ORIGIN}/outings`))
    expect(res.status).toBe(307)
  })
})

describe('app/[locale]: only the outing subtree reads the session', () => {
  // tests/locale-segment-public-only.test.ts forbids direct server-auth imports
  // in app/[locale]. The outing pages read the session through
  // lib/outing/access (who is this friend), which is only sound because the
  // proxy refreshes the session on those paths (above).
  const ROOT = join(process.cwd(), 'app', '[locale]')
  const files: string[] = []
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const f = join(d, e.name)
      if (e.isDirectory()) walk(f)
      else if (/\.(ts|tsx)$/.test(e.name)) files.push(f)
    }
  }
  walk(ROOT)

  it('lib/outing/access is imported only under app/[locale]/outing', () => {
    const offenders = files
      .filter((f) => /from\s+['"]@\/lib\/outing\/access['"]/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(ROOT, f))
      .filter((f) => !f.startsWith('outing/'))
    expect(offenders).toEqual([])
  })
})
