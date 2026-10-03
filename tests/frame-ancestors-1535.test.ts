import { describe, it, expect } from 'vitest'
// Next's own matcher — the same one the router uses for next.config headers()
// (server/lib/router-utils/filesystem.js › buildCustomRoute), so this test
// fails if a source pattern doesn't match the way we think it does.
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match'
import { headerRules, FRAME_DENY_ROOTS } from '@/next.config'
import { PROTECTED_ROOT_SEGMENTS } from '@/lib/auth/protectedPaths'

// #1535: signed-in pages, /invite/* and /api/* refuse to be framed.
// Failure looks like nothing: pages render normally, they are just frameable.

function headersFor(pathname: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rule of headerRules) {
    const match = getPathMatch(rule.source, {
      strict: true,
      removeUnnamedParams: true,
      sensitive: false,
    })
    if (match(pathname)) {
      for (const h of rule.headers) out[h.key.toLowerCase()] = h.value
    }
  }
  return out
}

function expectFrameDenied(pathname: string) {
  const h = headersFor(pathname)
  expect(h['content-security-policy']).toBe("frame-ancestors 'none'")
  expect(h['x-frame-options']).toBe('DENY')
}

function expectNoFrameHeaders(pathname: string) {
  const h = headersFor(pathname)
  expect(h['content-security-policy']).toBeUndefined()
  expect(h['x-frame-options']).toBeUndefined()
}

describe('frame-ancestors on signed-in routes (#1535)', () => {
  it('covers exactly PROTECTED_ROOT_SEGMENTS + api + invite (drift guard)', () => {
    expect([...FRAME_DENY_ROOTS].sort()).toEqual(
      [...PROTECTED_ROOT_SEGMENTS, 'api', 'invite'].sort(),
    )
  })

  it.each([...PROTECTED_ROOT_SEGMENTS])('/%s (bare root) is frame-denied', (seg) => {
    expectFrameDenied(`/${seg}`)
  })

  it.each([...PROTECTED_ROOT_SEGMENTS])('/%s/a/b (nested) is frame-denied', (seg) => {
    expectFrameDenied(`/${seg}/a/b`)
  })

  it.each([
    '/invite/abc',
    '/api/export/transactions',
    '/settings/account',
    '/Dashboard', // matching is case-insensitive, like the router's
  ])('%s is frame-denied', (p) => {
    expectFrameDenied(p)
  })

  it.each([
    '/',
    '/zh-TW',
    '/zh-TW/sign-in',
    '/sign-in',
    '/en/migrate/moneybook',
    '/auth/callback',
    '/offline',
    '/terms',
    '/privacy',
    '/dashboardx',
    '/en/dashboard',
    '/sw.js',
  ])('%s (public) gets no frame headers', (p) => {
    expectNoFrameHeaders(p)
  })

  it('leaves the existing Cache-Control rules intact', () => {
    expect(headersFor('/sw.js')['cache-control']).toBe('no-store, max-age=0')
    expect(headersFor('/og-image.png')['cache-control']).toBe('public, max-age=604800')
  })
})
