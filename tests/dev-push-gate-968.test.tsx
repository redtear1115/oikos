// @vitest-environment node
/**
 * #968 S4c — the push-gate probe (app/dev/push-gate) exists only under
 * `next dev`.
 *
 * It lets the emulator checks (E-old / E-new) call `registerPushToken` without
 * signing in. Everything outside development must not serve it: the page
 * 404s unless NODE_ENV is exactly 'development', and the proxy only lets the
 * path skip the auth gate under that same condition.
 *
 * Failure looks like (if a guard is dropped): a production deployment serves a
 * page that calls the native push plugin with ids taken from the query string
 * — no error anywhere, the page just renders. The production build itself is
 * also checked by hand in the PR (route returns 307/404 under `next start`).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isValidElement, type ReactElement } from 'react'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  getUser: vi.fn(async () => ({ data: { user: null } })),
}))

vi.mock('next/navigation', () => ({
  notFound: () => { throw Object.assign(new Error('NEXT_HTTP_ERROR_FALLBACK;404'), { digest: 'NEXT_HTTP_ERROR_FALLBACK;404' }) },
  redirect: (to: string) => { throw new Error(`redirect ${to}`) },
}))
// The probe is a client component; the page test only needs to see it handed over.
vi.mock('@/app/dev/push-gate/PushGateProbe', () => ({
  PushGateProbe: function PushGateProbe() { return null },
}))
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({ auth: { getUser: h.getUser } })),
}))

const { default: Page } = await import('@/app/dev/push-gate/page')
const { PushGateProbe } = await import('@/app/dev/push-gate/PushGateProbe')
const { proxy } = await import('@/proxy')

const ORIGIN = 'https://futari.southern-light.dev'
const params = (sp: Record<string, string> = {}) => ({ searchParams: Promise.resolve(sp) })

beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('app/dev/push-gate page', () => {
  it.each(['production', 'test', ''])('NODE_ENV=%s → notFound(), probe never rendered', async (env) => {
    vi.stubEnv('NODE_ENV', env)
    await expect(Page(params({ userId: '11111111-1111-1111-1111-111111111111' })))
      .rejects.toMatchObject({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' })
  })

  it('NODE_ENV=development → renders the probe with UUID params only', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const el = await Page(params({
      userId: '11111111-1111-1111-1111-111111111111',
      groupId: "x' OR 1=1 --",
    }))
    expect(isValidElement(el)).toBe(true)
    const probe = el as ReactElement<{ userId: string; groupId: string }>
    expect(probe.type).toBe(PushGateProbe)
    expect(probe.props.userId).toBe('11111111-1111-1111-1111-111111111111')
    expect(probe.props.groupId).toBe('00000000-0000-0000-0000-000000000000')
  })

  it('the guard is the first statement of the page component', () => {
    const src = readFileSync(join(process.cwd(), 'app/dev/push-gate/page.tsx'), 'utf8')
    const body = src.slice(src.indexOf('export default async function'))
    const firstStatement = body.slice(body.indexOf('{', body.indexOf(')')) + 1).trim().split('\n')[0]
    expect(firstStatement).toBe("if (process.env.NODE_ENV !== 'development') notFound()")
  })
})

describe('proxy: /dev/push-gate skips the auth gate only in development', () => {
  it('production, signed out → 307 to /sign-in (auth gate intact)', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const res = await proxy(new NextRequest(`${ORIGIN}/dev/push-gate`))
    expect(res.status).toBe(307)
    expect(new URL(res.headers.get('location')!).pathname).toBe('/sign-in')
    expect(h.getUser).toHaveBeenCalledOnce()
  })

  it('development, signed out → passes through without getUser()', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const res = await proxy(new NextRequest(`${ORIGIN}/dev/push-gate`))
    expect(res.headers.get('location')).toBeNull()
    expect(h.getUser).not.toHaveBeenCalled()
  })

  it.each(['/dev/push-gate/x', '/dev/push-gatex', '/dev', '/dev/other'])(
    'development, %s → still auth-gated (exact match only)',
    async (path) => {
      vi.stubEnv('NODE_ENV', 'development')
      const res = await proxy(new NextRequest(`${ORIGIN}${path}`))
      expect(res.status).toBe(307)
      expect(h.getUser).toHaveBeenCalledOnce()
    },
  )
})

describe('not advertised', () => {
  it('sitemap and robots never mention /dev', async () => {
    const { default: sitemap } = await import('@/app/sitemap')
    const urls = sitemap().map((e) => e.url)
    expect(urls.some((u) => new URL(u).pathname.startsWith('/dev'))).toBe(false)
    const { default: robots } = await import('@/app/robots')
    expect(JSON.stringify(robots())).not.toContain('/dev/push-gate')
  })
})
