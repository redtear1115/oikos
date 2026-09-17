import { describe, it, expect } from 'vitest'
import { SUPPORTED_LOCALES } from '@/lib/i18n/locales-meta'
import { globalErrorCopy, pickGlobalErrorLocale, type GlobalErrorCopy } from '@/lib/i18n/globalErrorCopy'

describe('globalErrorCopy', () => {
  it('has all four keys, non-empty, for every supported locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const copy = globalErrorCopy[locale]
      expect(copy).toBeDefined()
      for (const key of ['title', 'body', 'retry', 'home'] as (keyof GlobalErrorCopy)[]) {
        expect(copy[key].trim().length).toBeGreaterThan(0)
      }
    }
  })
})

describe('pickGlobalErrorLocale', () => {
  it('prefers the lang cookie over navigator.language', () => {
    expect(pickGlobalErrorLocale('lang=ja', 'en-US')).toBe('ja')
  })

  it('falls back to navigator.language when the cookie is absent', () => {
    expect(pickGlobalErrorLocale(undefined, 'en-US')).toBe('en')
    expect(pickGlobalErrorLocale('', 'ja-JP')).toBe('ja')
  })

  it('maps zh-CN / zh-Hans navigator tags to zh-CN, other zh to zh-TW', () => {
    expect(pickGlobalErrorLocale(undefined, 'zh-CN')).toBe('zh-CN')
    expect(pickGlobalErrorLocale(undefined, 'zh-Hans')).toBe('zh-CN')
    expect(pickGlobalErrorLocale(undefined, 'zh-TW')).toBe('zh-TW')
    expect(pickGlobalErrorLocale(undefined, 'zh-HK')).toBe('zh-TW')
  })

  it('falls back to zh-TW when neither source resolves', () => {
    // '' rather than `undefined` for both args — `undefined` would trigger
    // this function's own default parameters (which read `document`/
    // `navigator`), defeating the point of passing explicit inputs here.
    expect(pickGlobalErrorLocale('', '')).toBe('zh-TW')
    expect(pickGlobalErrorLocale('lang=fr', 'fr-FR')).toBe('zh-TW')
  })

  it('ignores an unsupported cookie value and falls through to navigator', () => {
    expect(pickGlobalErrorLocale('lang=xx; other=1', 'ja-JP')).toBe('ja')
  })

  it('reads the right cookie among several, with surrounding whitespace', () => {
    expect(pickGlobalErrorLocale('foo=bar; lang=en; baz=qux', undefined)).toBe('en')
  })
})
