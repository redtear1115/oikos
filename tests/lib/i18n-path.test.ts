import { describe, it, expect } from 'vitest'
import {
  parseLocaleFromPath,
  stripLocaleFromPath,
  localizedHref,
  PUBLIC_LOCALIZED_PATHS,
  isPublicLocalizedPath,
} from '@/lib/i18n/path'

describe('parseLocaleFromPath', () => {
  it('returns prefix locale for /en/sign-in', () => {
    expect(parseLocaleFromPath('/en/sign-in')).toBe('en')
  })
  it('returns null for unprefixed /sign-in', () => {
    expect(parseLocaleFromPath('/sign-in')).toBeNull()
  })
  it('returns prefix locale for /zh-CN (bare prefix = landing)', () => {
    expect(parseLocaleFromPath('/zh-CN')).toBe('zh-CN')
  })
  it('returns null for /enterprise (not a locale)', () => {
    expect(parseLocaleFromPath('/enterprise')).toBeNull()
  })
  it('returns null for /', () => {
    expect(parseLocaleFromPath('/')).toBeNull()
  })
})

describe('stripLocaleFromPath', () => {
  it('strips /en prefix', () => {
    expect(stripLocaleFromPath('/en/sign-in')).toBe('/sign-in')
  })
  it('strips bare /ja → /', () => {
    expect(stripLocaleFromPath('/ja')).toBe('/')
  })
  it('returns unchanged when no prefix', () => {
    expect(stripLocaleFromPath('/sign-in')).toBe('/sign-in')
  })
})

describe('localizedHref', () => {
  it('default locale = unprefixed', () => {
    expect(localizedHref('/sign-in', 'zh-TW')).toBe('/sign-in')
    expect(localizedHref('/', 'zh-TW')).toBe('/')
  })
  it('non-default locale = prefixed', () => {
    expect(localizedHref('/sign-in', 'en')).toBe('/en/sign-in')
    expect(localizedHref('/terms', 'ja')).toBe('/ja/terms')
    expect(localizedHref('/', 'zh-CN')).toBe('/zh-CN')
  })
})

describe('isPublicLocalizedPath', () => {
  it('matches unprefixed public paths', () => {
    expect(isPublicLocalizedPath('/')).toBe(true)
    expect(isPublicLocalizedPath('/sign-in')).toBe(true)
    expect(isPublicLocalizedPath('/terms')).toBe(true)
    expect(isPublicLocalizedPath('/privacy')).toBe(true)
  })
  it('matches prefixed public paths', () => {
    expect(isPublicLocalizedPath('/en')).toBe(true)
    expect(isPublicLocalizedPath('/en/sign-in')).toBe(true)
    expect(isPublicLocalizedPath('/ja/terms')).toBe(true)
    expect(isPublicLocalizedPath('/zh-CN/privacy')).toBe(true)
  })
  it('does not match auth-walled paths', () => {
    expect(isPublicLocalizedPath('/dashboard')).toBe(false)
    expect(isPublicLocalizedPath('/onboarding')).toBe(false)
    expect(isPublicLocalizedPath('/setup')).toBe(false)
    expect(isPublicLocalizedPath('/invite/abc')).toBe(false)
    expect(isPublicLocalizedPath('/auth/callback')).toBe(false)
    expect(isPublicLocalizedPath('/en/dashboard')).toBe(false)
  })
})

describe('PUBLIC_LOCALIZED_PATHS', () => {
  it('lists 4 public paths', () => {
    expect(PUBLIC_LOCALIZED_PATHS).toEqual(['/', '/sign-in', '/terms', '/privacy'])
  })
})
