import { describe, it, expect } from 'vitest'
import {
  decideLocaleRouting,
  stripLocaleFromPath,
  buildLocaleUrl,
  getHreflangAlternates,
} from '@/lib/i18n/routing'

describe('stripLocaleFromPath', () => {
  it('returns null locale + original path for unprefixed paths', () => {
    expect(stripLocaleFromPath('/')).toEqual({ locale: null, rest: '/' })
    expect(stripLocaleFromPath('/sign-in')).toEqual({ locale: null, rest: '/sign-in' })
    expect(stripLocaleFromPath('/dashboard')).toEqual({ locale: null, rest: '/dashboard' })
  })

  it('extracts the locale prefix and returns the remainder', () => {
    expect(stripLocaleFromPath('/en')).toEqual({ locale: 'en', rest: '/' })
    expect(stripLocaleFromPath('/en/sign-in')).toEqual({ locale: 'en', rest: '/sign-in' })
    expect(stripLocaleFromPath('/zh-CN/terms')).toEqual({ locale: 'zh-CN', rest: '/terms' })
    expect(stripLocaleFromPath('/ja/privacy')).toEqual({ locale: 'ja', rest: '/privacy' })
  })

  it('does not treat unknown first segments as locales', () => {
    expect(stripLocaleFromPath('/foobar')).toEqual({ locale: null, rest: '/foobar' })
    expect(stripLocaleFromPath('/EN')).toEqual({ locale: null, rest: '/EN' }) // case-sensitive
  })

  it('normalizes trailing slashes', () => {
    expect(stripLocaleFromPath('/sign-in/')).toEqual({ locale: null, rest: '/sign-in' })
    expect(stripLocaleFromPath('/en/terms/')).toEqual({ locale: 'en', rest: '/terms' })
    expect(stripLocaleFromPath('/')).toEqual({ locale: null, rest: '/' }) // root unchanged
  })
})

describe('decideLocaleRouting', () => {
  // Public pages — unprefixed → rewrite to default locale prefix
  it('rewrites unprefixed public pages to default locale path', () => {
    expect(decideLocaleRouting('/')).toEqual({
      action: 'rewrite',
      targetPath: '/zh-TW',
      locale: 'zh-TW',
    })
    expect(decideLocaleRouting('/sign-in')).toEqual({
      action: 'rewrite',
      targetPath: '/zh-TW/sign-in',
      locale: 'zh-TW',
    })
    expect(decideLocaleRouting('/terms')).toEqual({
      action: 'rewrite',
      targetPath: '/zh-TW/terms',
      locale: 'zh-TW',
    })
  })

  // Public pages — default-locale-prefixed → 308 redirect to canonical unprefixed
  it('redirects default-locale-prefixed public pages to the canonical unprefixed URL', () => {
    expect(decideLocaleRouting('/zh-TW')).toEqual({
      action: 'redirect',
      targetPath: '/',
      status: 308,
    })
    expect(decideLocaleRouting('/zh-TW/sign-in')).toEqual({
      action: 'redirect',
      targetPath: '/sign-in',
      status: 308,
    })
  })

  // Public pages — non-default-locale-prefixed → pass through, set header
  it('passes through non-default-locale-prefixed public pages with x-locale signal', () => {
    expect(decideLocaleRouting('/en/sign-in')).toEqual({
      action: 'set-locale',
      locale: 'en',
    })
    expect(decideLocaleRouting('/zh-CN/terms')).toEqual({
      action: 'set-locale',
      locale: 'zh-CN',
    })
    expect(decideLocaleRouting('/ja')).toEqual({
      action: 'set-locale',
      locale: 'ja',
    })
  })

  // Non-public pages — passthrough regardless
  it('passes through non-public pages unchanged', () => {
    expect(decideLocaleRouting('/dashboard')).toEqual({ action: 'passthrough' })
    expect(decideLocaleRouting('/records')).toEqual({ action: 'passthrough' })
    expect(decideLocaleRouting('/assets/abc123')).toEqual({ action: 'passthrough' })
    expect(decideLocaleRouting('/auth/callback')).toEqual({ action: 'passthrough' })
    expect(decideLocaleRouting('/api/export/transactions')).toEqual({ action: 'passthrough' })
    expect(decideLocaleRouting('/onboarding')).toEqual({ action: 'passthrough' })
    expect(decideLocaleRouting('/invite/abc')).toEqual({ action: 'passthrough' })
  })

  // Unknown paths that look like locale-prefixed public pages → 404 via passthrough
  // (Next.js resolves them through [locale]/layout.tsx which calls notFound)
  it('passes through unknown locale-prefixed paths (handled downstream by [locale]/layout.tsx)', () => {
    expect(decideLocaleRouting('/en/some-bogus-path')).toEqual({ action: 'passthrough' })
  })

  it('handles trailing slashes on public pages', () => {
    expect(decideLocaleRouting('/sign-in/')).toEqual({
      action: 'rewrite',
      targetPath: '/zh-TW/sign-in',
      locale: 'zh-TW',
    })
  })
})

describe('buildLocaleUrl', () => {
  it('strips prefix when switching to default locale', () => {
    expect(buildLocaleUrl('/en/sign-in', 'zh-TW')).toBe('/sign-in')
    expect(buildLocaleUrl('/ja', 'zh-TW')).toBe('/')
  })

  it('adds prefix when switching to non-default locale', () => {
    expect(buildLocaleUrl('/sign-in', 'en')).toBe('/en/sign-in')
    expect(buildLocaleUrl('/', 'ja')).toBe('/ja')
  })

  it('swaps locale prefix when switching between non-default locales', () => {
    expect(buildLocaleUrl('/en/sign-in', 'ja')).toBe('/ja/sign-in')
    expect(buildLocaleUrl('/zh-CN', 'en')).toBe('/en')
  })
})

describe('getHreflangAlternates', () => {
  const base = 'https://futari.example'

  it('emits canonical + per-locale + x-default for landing', () => {
    expect(getHreflangAlternates('/', base)).toEqual({
      canonical: `${base}/`,
      languages: {
        'zh-TW': `${base}/`,
        'zh-CN': `${base}/zh-CN`,
        en: `${base}/en`,
        ja: `${base}/ja`,
        'x-default': `${base}/`,
      },
    })
  })

  it('emits per-locale URLs for sub-paths', () => {
    expect(getHreflangAlternates('/sign-in', base)).toEqual({
      canonical: `${base}/sign-in`,
      languages: {
        'zh-TW': `${base}/sign-in`,
        'zh-CN': `${base}/zh-CN/sign-in`,
        en: `${base}/en/sign-in`,
        ja: `${base}/ja/sign-in`,
        'x-default': `${base}/sign-in`,
      },
    })
  })
})
