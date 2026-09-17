import { describe, it, expect } from 'vitest'
import {
  parseLocaleFromPath,
  isPublicLocalizedPath,
  isLocalePrefixedPath,
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

  // #1275: proxy 對任何 `/<locale>/...` 略過 getUser()，讓未知路徑落到
  // app/[locale] 的 404。這是 auth 決策，所以判斷必須嚴格：
  // parseLocaleFromPath 會吞掉空 segment（`//en/x` → 'en'），不能拿來用。
  describe('#1275 isLocalePrefixedPath (strict, for the auth-skip)', () => {
    it.each(['/en', '/en/', '/en/foo', '/zh-TW/api/export/transactions'])(
      'locale-prefixed: %s',
      (p) => {
        expect(isLocalePrefixedPath(p)).toBe(true)
      },
    )

    it.each(['//en/foo', '/en\\foo', '/enx/foo', '/zh%2DTW/dashboard', '/dashboard', '/'])(
      'NOT locale-prefixed (stays behind the auth gate): %s',
      (p) => {
        expect(isLocalePrefixedPath(p)).toBe(false)
      },
    )

    it('parseLocaleFromPath is looser — the reason it is not used for the skip', () => {
      expect(parseLocaleFromPath('//en/foo')).toBe('en')
      expect(isLocalePrefixedPath('//en/foo')).toBe(false)
    })

    it('unknown locale-prefixed path is still NOT public-localized (no cookie sync)', () => {
      expect(isPublicLocalizedPath('/en/foo')).toBe(false)
    })
  })
})
