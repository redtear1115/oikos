/**
 * #968 S4c — the push-gate probe (app/dev/push-gate) exists only under
 * `next dev`.
 *
 * It lets the emulator checks (E-old / E-new) call `registerPushToken` with
 * the signed-in session. Everything outside development must not serve it:
 * the page 404s unless NODE_ENV is exactly 'development', before any session
 * lookup. The path gets no auth-gate exemption in proxy.ts (owner decision):
 * signed out, it redirects to /sign-in like any other non-public path.
 *
 * Failure looks like (if a guard is dropped): a production deployment serves a
 * page that calls the native push plugin — no error anywhere, the page just
 * renders.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isValidElement, type ReactElement } from 'react'

const h = vi.hoisted(() => ({
  getCurrentUser: vi.fn(async (): Promise<{ id: string } | null> => ({ id: 'session-user' })),
  getActiveGroupForUser: vi.fn(async (_id: string): Promise<{ id: string } | null> => ({ id: 'active-group' })),
}))

vi.mock('next/navigation', () => ({
  notFound: () => { throw Object.assign(new Error('NEXT_HTTP_ERROR_FALLBACK;404'), { digest: 'NEXT_HTTP_ERROR_FALLBACK;404' }) },
  redirect: (to: string) => { throw new Error(`redirect ${to}`) },
}))
vi.mock('@/lib/supabase/server', () => ({ getCurrentUser: h.getCurrentUser }))
vi.mock('@/lib/db/queries/group', () => ({ getActiveGroupForUser: h.getActiveGroupForUser }))
// The probe is a client component; the page test only needs to see it handed over.
vi.mock('@/app/dev/push-gate/PushGateProbe', () => ({
  PushGateProbe: function PushGateProbe() { return null },
}))

const { default: Page } = await import('@/app/dev/push-gate/page')
const { PushGateProbe } = await import('@/app/dev/push-gate/PushGateProbe')

type ProbeElement = ReactElement<{ userId: string; groupId: string | null }>

beforeEach(() => {
  vi.clearAllMocks()
  h.getCurrentUser.mockImplementation(async () => ({ id: 'session-user' }))
  h.getActiveGroupForUser.mockImplementation(async () => ({ id: 'active-group' }))
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('app/dev/push-gate page', () => {
  it.each(['production', 'test', ''])('NODE_ENV=%s → notFound() before any session lookup', async (env) => {
    vi.stubEnv('NODE_ENV', env)
    await expect(Page()).rejects.toMatchObject({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' })
    expect(h.getCurrentUser).not.toHaveBeenCalled()
    expect(h.getActiveGroupForUser).not.toHaveBeenCalled()
  })

  it('development, signed in → probe gets the session user and their active ledger', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const el = await Page()
    expect(isValidElement(el)).toBe(true)
    const probe = el as ProbeElement
    expect(probe.type).toBe(PushGateProbe)
    expect(probe.props).toEqual({ userId: 'session-user', groupId: 'active-group' })
    expect(h.getActiveGroupForUser).toHaveBeenCalledWith('session-user')
  })

  it('development, no active ledger → probe gets groupId null (it then does not register)', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    h.getActiveGroupForUser.mockImplementation(async () => null)
    const probe = (await Page()) as ProbeElement
    expect(probe.props).toEqual({ userId: 'session-user', groupId: null })
  })

  it('development, no session → notFound()', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    h.getCurrentUser.mockImplementation(async () => null)
    await expect(Page()).rejects.toMatchObject({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' })
    expect(h.getActiveGroupForUser).not.toHaveBeenCalled()
  })

  it('the guard is the first statement of the page component', () => {
    const src = readFileSync(join(process.cwd(), 'app/dev/push-gate/page.tsx'), 'utf8')
    const body = src.slice(src.indexOf('export default async function'))
    const firstStatement = body.slice(body.indexOf('{') + 1).trim().split('\n')[0]
    expect(firstStatement).toBe("if (process.env.NODE_ENV !== 'development') notFound()")
  })

  it('takes no ids from the query string', () => {
    const src = readFileSync(join(process.cwd(), 'app/dev/push-gate/page.tsx'), 'utf8')
    expect(src).not.toContain('searchParams')
  })
})

describe('proxy.ts has no exemption for the probe (owner decision)', () => {
  it('proxy.ts never mentions /dev/', () => {
    const src = readFileSync(join(process.cwd(), 'proxy.ts'), 'utf8')
    expect(src).not.toContain('/dev/')
    expect(src).not.toContain('push-gate')
  })
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
