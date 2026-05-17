import { describe, it, expect } from 'vitest'
import {
  parseLocaleFromPath,
  isPublicLocalizedPath,
  stripLocaleFromPath,
  localizedHref,
} from '@/lib/i18n/path'

// Middleware itself is hard to unit test (NextRequest mocking + supabase init).
// These guard the pure-helper assumptions that middleware encodes.
describe('middleware locale routing — input cases', () => {
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
  it('auth-walled path → middleware should not touch locale', () => {
    expect(isPublicLocalizedPath('/dashboard')).toBe(false)
    expect(isPublicLocalizedPath('/onboarding')).toBe(false)
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
