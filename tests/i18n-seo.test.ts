import { describe, it, expect } from 'vitest'
import {
  buildAlternates,
  ogLocale,
  alternateOgLocales,
} from '@/lib/i18n/seo'
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, type Locale } from '@/lib/i18n/locales-meta'
import { en } from '@/lib/i18n/locales/en'

// APP_URL comes from vitest.config.ts (NEXT_PUBLIC_APP_URL=http://localhost:3000)
const APP_URL = 'http://localhost:3000'

// Every public route the proxy treats as a localized public path. Adding a new
// public page? Add it here so the canonical/hreflang pair is locked in.
const PUBLIC_PATHS = [
  '/',
  '/sign-in',
  '/terms',
  '/privacy',
  '/migrate/honeydue',
  '/migrate/spendee',
  '/migrate/cwmoney',
] as const

describe('buildAlternates', () => {
  it.each(PUBLIC_PATHS)('emits all 4 hreflang languages + x-default for %s', (path) => {
    const alts = buildAlternates(path, DEFAULT_LOCALE)
    const languages = alts?.languages as Record<string, string>
    expect(Object.keys(languages).sort()).toEqual(
      [...SUPPORTED_LOCALES, 'x-default'].sort()
    )
  })

  it.each(PUBLIC_PATHS)('x-default points to the zh-TW URL for %s', (path) => {
    const alts = buildAlternates(path, 'en')
    const languages = alts?.languages as Record<string, string>
    expect(languages['x-default']).toBe(languages[DEFAULT_LOCALE])
  })

  it('default-locale URLs have no locale prefix; others are prefixed', () => {
    const alts = buildAlternates('/sign-in', 'en')
    const languages = alts?.languages as Record<string, string>
    expect(languages['zh-TW']).toBe(`${APP_URL}/sign-in`)
    expect(languages['zh-CN']).toBe(`${APP_URL}/zh-CN/sign-in`)
    expect(languages['en']).toBe(`${APP_URL}/en/sign-in`)
    expect(languages['ja']).toBe(`${APP_URL}/ja/sign-in`)
    expect(languages['x-default']).toBe(`${APP_URL}/sign-in`)
  })

  // Note: helper returns `${APP_URL}/` for the default-locale root; Next.js
  // metadata pipeline normalizes the trailing slash off when rendering the
  // <link rel="alternate" href="..."> tag, so the wire output matches what
  // the issue spec'd (`https://futari.southern-light.dev`, no trailing /).
  it('root path: default locale = APP_URL/, others get /<locale> prefix', () => {
    const alts = buildAlternates('/', DEFAULT_LOCALE)
    const languages = alts?.languages as Record<string, string>
    expect(languages['zh-TW']).toBe(`${APP_URL}/`)
    expect(languages['zh-CN']).toBe(`${APP_URL}/zh-CN`)
    expect(languages['en']).toBe(`${APP_URL}/en`)
    expect(languages['ja']).toBe(`${APP_URL}/ja`)
    expect(languages['x-default']).toBe(`${APP_URL}/`)
  })

  it('nested migrate paths keep their full path after the locale segment', () => {
    const alts = buildAlternates('/migrate/honeydue', 'ja')
    const languages = alts?.languages as Record<string, string>
    expect(languages['zh-TW']).toBe(`${APP_URL}/migrate/honeydue`)
    expect(languages['en']).toBe(`${APP_URL}/en/migrate/honeydue`)
    expect(languages['ja']).toBe(`${APP_URL}/ja/migrate/honeydue`)
  })

  it.each(SUPPORTED_LOCALES)('canonical reflects the current locale (%s)', (locale: Locale) => {
    const alts = buildAlternates('/sign-in', locale)
    const languages = alts?.languages as Record<string, string>
    expect(alts?.canonical).toBe(languages[locale])
  })

  it('canonical for root + non-default locale includes the prefix', () => {
    const alts = buildAlternates('/', 'ja')
    expect(alts?.canonical).toBe(`${APP_URL}/ja`)
  })
})

describe('ogLocale', () => {
  it('maps each supported locale to its og:locale token', () => {
    expect(ogLocale('zh-TW')).toBe('zh_TW')
    expect(ogLocale('zh-CN')).toBe('zh_CN')
    expect(ogLocale('en')).toBe('en_US')
    expect(ogLocale('ja')).toBe('ja_JP')
  })
})

describe('alternateOgLocales', () => {
  it.each(SUPPORTED_LOCALES)('excludes the current locale (%s) from the alternates', (locale: Locale) => {
    const alts = alternateOgLocales(locale)
    expect(alts).not.toContain(ogLocale(locale))
    expect(alts).toHaveLength(SUPPORTED_LOCALES.length - 1)
  })

  it('returns og-format tokens (underscore), not BCP-47 dashes', () => {
    expect(alternateOgLocales('en')).toEqual(
      expect.arrayContaining(['zh_TW', 'zh_CN', 'ja_JP'])
    )
  })
})

describe('English meta description length (#702)', () => {
  // SERPs truncate <meta name="description"> around 155–160 chars. English
  // descriptions are held to ≤155 so they render without trimming. CJK locales
  // (zh-TW/zh-CN/ja) truncate at a different threshold and are not covered here.
  const MAX = 155

  function collectDescriptions(node: unknown, path: string): [string, string][] {
    if (typeof node !== 'object' || node === null) return []
    const out: [string, string][] = []
    for (const [key, value] of Object.entries(node)) {
      const p = `${path}.${key}`
      if (key === 'description' && typeof value === 'string') out.push([p, value])
      else if (typeof value === 'object') out.push(...collectDescriptions(value, p))
    }
    return out
  }

  const descriptions = collectDescriptions(en.seo, 'seo')

  it('finds the known seo descriptions', () => {
    expect(descriptions.length).toBeGreaterThanOrEqual(7)
  })

  it.each(descriptions)('%s is ≤155 chars', (_path, value) => {
    expect(value.length).toBeLessThanOrEqual(MAX)
  })
})
