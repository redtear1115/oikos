import { describe, it, expect } from 'vitest'
import {
  parseLocaleFromPath,
  isPublicLocalizedPath,
  stripLocaleFromPath,
  localizedHref,
} from '@/lib/i18n/path'

// Proxy itself is hard to unit test (NextRequest mocking + supabase init).
// These guard the pure-helper assumptions that proxy encodes.
describe('proxy locale routing — input cases', () => {
  it('unprefixed public path → needs rewrite to /zh-TW', () => {
    const pathname = '/sign-in'
    expect(isPublicLocalizedPath(pathname)).toBe(true)
    expect(parseLocaleFromPath(pathname)).toBeNull()
  })
  it('prefixed public path → no rewrite needed', () => {
    const pathname = '/en/sign-in'
    expect(isPublicLocalizedPath(pathname)).toBe(true)
    expect(parseLocaleFromPath(pathname)).toBe('en')
  })
  it('auth-walled path → proxy should not touch locale', () => {
    expect(isPublicLocalizedPath('/dashboard')).toBe(false)
    expect(isPublicLocalizedPath('/onboarding')).toBe(false)
  })

  // #920 Phase 1: the proxy skips supabase.auth.getUser() iff `isPublic`.
  // `isPublic` = isPublicLocalizedPath || /auth/* || /invite/* || /offline.
  // These guard that the public/protected classification the skip relies on is
  // exactly the set we intend — a protected path slipping into "public" would
  // silently drop its auth gate.
  describe('#920 public/protected split for the auth-skip', () => {
    const PUBLIC = [
      '/', '/sign-in', '/terms', '/privacy',
      '/en/sign-in', '/ja/', '/zh-CN/terms',
      '/migrate/honeydue', '/en/migrate/spendee',
      '/use-case/pet-owners', '/ja/use-case/newlyweds',
    ]
    const PROTECTED = [
      '/dashboard', '/onboarding', '/setup',
      '/records', '/stats', '/past-times',
      '/en/dashboard', '/ja/records',
    ]

    it.each(PUBLIC)('public localized path stays public: %s', (p) => {
      expect(isPublicLocalizedPath(p)).toBe(true)
    })

    it.each(PROTECTED)('protected path is NOT public-localized: %s', (p) => {
      expect(isPublicLocalizedPath(p)).toBe(false)
    })
  })
  it('redirect target after unauthed access: locale-aware', () => {
    const cookieLocale = 'ja' as const
    const target = localizedHref('/sign-in', cookieLocale)
    expect(target).toBe('/ja/sign-in')
  })
  it('stripLocaleFromPath strips /en/sign-in correctly', () => {
    expect(stripLocaleFromPath('/en/sign-in')).toBe('/sign-in')
  })
})
