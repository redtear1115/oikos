import { describe, it, expect } from 'vitest'
import sitemap from '@/app/sitemap'
import robots from '@/app/robots'
import { SUPPORTED_LOCALES } from '@/lib/i18n/locales-meta'

describe('sitemap.xml', () => {
  const entries = sitemap()
  const urls = entries.map((e) => e.url)

  it('includes all three /migrate/* landing pages per locale', () => {
    const sources = ['honeydue', 'spendee', 'cwmoney']
    for (const source of sources) {
      for (const locale of SUPPORTED_LOCALES) {
        const expected =
          locale === 'zh-TW'
            ? `/migrate/${source}`
            : `/${locale}/migrate/${source}`
        expect(urls.some((u) => u.endsWith(expected))).toBe(true)
      }
    }
  })

  it('does NOT include /sign-in (consistent with robots.ts disallow)', () => {
    expect(urls.some((u) => u.endsWith('/sign-in'))).toBe(false)
  })

  it('attaches hreflang alternates with all supported locales + x-default', () => {
    for (const entry of entries) {
      expect(entry.alternates?.languages).toBeDefined()
      const langs = Object.keys(entry.alternates!.languages!)
      for (const locale of SUPPORTED_LOCALES) {
        expect(langs).toContain(locale)
      }
      expect(langs).toContain('x-default')
    }
  })
})

describe('robots.txt', () => {
  const result = robots()
  const rule = Array.isArray(result.rules) ? result.rules[0] : result.rules
  const allow = (Array.isArray(rule.allow) ? rule.allow : [rule.allow]).filter(
    Boolean,
  ) as string[]
  const disallow = (Array.isArray(rule.disallow)
    ? rule.disallow
    : [rule.disallow]
  ).filter(Boolean) as string[]

  it('declares Sitemap directive pointing to /sitemap.xml', () => {
    expect(result.sitemap).toMatch(/\/sitemap\.xml$/)
  })

  it('disallows /sign-in for every locale variant', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const expected = locale === 'zh-TW' ? '/sign-in' : `/${locale}/sign-in`
      expect(disallow).toContain(expected)
    }
  })

  it('disallows /api/ and auth-walled paths', () => {
    expect(disallow).toContain('/api/')
    expect(disallow).toContain('/dashboard')
    expect(disallow).toContain('/onboarding')
  })

  it('explicitly allows the /migrate subtree per locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const expected =
        locale === 'zh-TW' ? '/migrate/' : `/${locale}/migrate/`
      expect(allow).toContain(expected)
    }
  })

  it('does NOT disallow /migrate (must remain crawlable)', () => {
    for (const blocked of disallow) {
      expect(blocked).not.toMatch(/\/migrate(\/|$)/)
    }
  })
})
