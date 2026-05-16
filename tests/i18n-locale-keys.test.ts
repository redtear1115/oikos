import { describe, it, expect } from 'vitest'
import { zhTW } from '@/lib/i18n/locales/zh-TW'
import { zhCN } from '@/lib/i18n/locales/zh-CN'
import { en } from '@/lib/i18n/locales/en'
import { ja } from '@/lib/i18n/locales/ja'

// Guards against the v0.17.3 hotfix scenario (#378): the Translations type
// is derived from zh-TW, so a missing key in zh-TW narrows the type and
// makes callsites fail tsc — but vitest never sees it. Conversely, extra
// keys in non-reference locales sneak past `as const` widening. We check
// both directions across the full nested key tree.

function collectKeyPaths(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return prefix ? [prefix] : []
  }
  const paths: string[] = []
  for (const key of Object.keys(value as Record<string, unknown>)) {
    const child = (value as Record<string, unknown>)[key]
    const next = prefix ? `${prefix}.${key}` : key
    if (child !== null && typeof child === 'object' && !Array.isArray(child)) {
      paths.push(...collectKeyPaths(child, next))
    } else {
      paths.push(next)
    }
  }
  return paths
}

const REFERENCE_LOCALE = 'zh-TW' as const
const locales = {
  'zh-TW': zhTW,
  'zh-CN': zhCN,
  en,
  ja,
} as const

const referenceKeys = new Set(collectKeyPaths(locales[REFERENCE_LOCALE]))

describe('collectKeyPaths (detection logic)', () => {
  it('produces dot-paths for nested keys', () => {
    expect(collectKeyPaths({ a: { b: { c: 'x' } }, d: 'y' }).sort()).toEqual([
      'a.b.c',
      'd',
    ])
  })

  it('treats string arrays as leaves (does not recurse into indices)', () => {
    expect(collectKeyPaths({ list: ['x', 'y'] })).toEqual(['list'])
  })

  it('flags a missing key when one side drops it', () => {
    const ref = new Set(collectKeyPaths({ settings: { language: 'a', currency: 'b' } }))
    const mutated = new Set(collectKeyPaths({ settings: { language: 'a' } }))
    const missing = [...ref].filter((k) => !mutated.has(k))
    expect(missing).toEqual(['settings.currency'])
  })

  it('flags an extra key when one side adds an unknown path', () => {
    const ref = new Set(collectKeyPaths({ settings: { language: 'a' } }))
    const mutated = new Set(collectKeyPaths({ settings: { language: 'a', extra: 'oops' } }))
    const extra = [...mutated].filter((k) => !ref.has(k))
    expect(extra).toEqual(['settings.extra'])
  })
})

describe('i18n locale key coverage', () => {
  it(`${REFERENCE_LOCALE} (reference) has a non-empty key set`, () => {
    expect(referenceKeys.size).toBeGreaterThan(0)
  })

  for (const [name, dict] of Object.entries(locales)) {
    if (name === REFERENCE_LOCALE) continue

    const localeKeys = new Set(collectKeyPaths(dict))

    it(`${name} contains every key from ${REFERENCE_LOCALE}`, () => {
      const missing = [...referenceKeys]
        .filter((k) => !localeKeys.has(k))
        .sort()
      expect(missing).toEqual([])
    })

    it(`${name} has no keys that ${REFERENCE_LOCALE} lacks`, () => {
      const extra = [...localeKeys]
        .filter((k) => !referenceKeys.has(k))
        .sort()
      expect(extra).toEqual([])
    })
  }
})
