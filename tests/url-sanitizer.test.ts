import { describe, it, expect } from 'vitest'
import {
  ANALYTICS_URL_PARAM_ALLOWLIST,
  MASKED_VALUE,
  REDACTED_URL,
  sanitizeAnalyticsUrl,
} from '@/lib/analytics/urlSanitizer'

/**
 * #1274 — `sanitizeAnalyticsUrl` is the single gate between app URLs and
 * third-party analytics / error tools. A regression here does not error; it
 * sends invite tokens and ledger filter values out again. So: every input
 * form in the contract, the query-key edge cases, and a fuzz pass asserting it
 * never throws and never echoes a secret.
 */

const TOKEN = 'ZZ_TOKEN_ZZ'
const AMOUNT = '87654321'

describe('sanitizeAnalyticsUrl — input forms', () => {
  it.each<[string, unknown, string]>([
    ['empty string', '', ''],
    ['whitespace only', '   ', ''],
    ['undefined', undefined, ''],
    ['null', null, ''],
    ['number', 42, ''],
    ['object', { href: `/invite/${TOKEN}` }, ''],
    ['URL instance (not a string)', new URL(`https://a.example/invite/${TOKEN}`), ''],

    ['absolute, no query', 'https://futari.example/dashboard', 'https://futari.example/dashboard'],
    ['absolute keeps port', 'http://localhost:3000/records', 'http://localhost:3000/records'],
    [
      'absolute invite',
      `https://futari.example/invite/${TOKEN}`,
      'https://futari.example/invite/:token',
    ],
    [
      'absolute invite with trailing path',
      `https://futari.example/invite/${TOKEN}/accept`,
      'https://futari.example/invite/:token/accept',
    ],
    [
      'localized invite path',
      `https://futari.example/zh-TW/invite/${TOKEN}`,
      'https://futari.example/zh-TW/invite/:token',
    ],
    ['bare /invite stays', 'https://futari.example/invite', 'https://futari.example/invite'],
    ['/invite/ with empty segment stays', 'https://futari.example/invite/', 'https://futari.example/invite/'],
    [
      'uppercase and encoded invite segment',
      `https://futari.example/%49NVITE/${TOKEN}`,
      'https://futari.example/%49NVITE/:token',
    ],
    [
      'filter values masked, utm kept',
      `https://futari.example/records?fAmtMin=${AMOUNT}&fQ=rent&utm_source=futari_app`,
      `https://futari.example/records?fAmtMin=${MASKED_VALUE}&fQ=${MASKED_VALUE}&utm_source=futari_app`,
    ],
    [
      'next carrying an invite token',
      `https://futari.example/sign-in?next=/invite/${TOKEN}&from=invite`,
      `https://futari.example/sign-in?next=${MASKED_VALUE}&from=invite`,
    ],
    ['hash dropped', `https://futari.example/records#${TOKEN}`, 'https://futari.example/records'],
    [
      'hash dropped after query',
      `https://futari.example/records?tab=a#x=${TOKEN}`,
      'https://futari.example/records?tab=a',
    ],
    [
      'credentials removed',
      `https://user:${TOKEN}@futari.example/x`,
      'https://futari.example/x',
    ],
    [
      'oauth callback code',
      `https://futari.example/auth/callback?code=${TOKEN}&next=/dashboard`,
      `https://futari.example/auth/callback?code=${MASKED_VALUE}&next=${MASKED_VALUE}`,
    ],

    ['relative path', '/dashboard', '/dashboard'],
    ['relative invite', `/invite/${TOKEN}`, '/invite/:token'],
    [
      'relative with query',
      `/records?drillCategory=food&to=2026-01-31&month=2026-01`,
      `/records?drillCategory=${MASKED_VALUE}&to=${MASKED_VALUE}&month=2026-01`,
    ],
    ['relative without leading slash', `invite/${TOKEN}`, '/invite/:token'],
    ['query only', `?next=/invite/${TOKEN}`, `?next=${MASKED_VALUE}`],
    ['hash only', `#${TOKEN}`, ''],
    ['relative with dot segments', `/a/../invite/${TOKEN}`, '/invite/:token'],
    ['relative with backslash', `\\invite\\${TOKEN}`, '/invite/:token'],
    ['repeated invite segment', `/invite/invite/${TOKEN}`, '/invite/:token/:token'],

    ['protocol-relative', `//cdn.example/invite/${TOKEN}?aid=${TOKEN}`, `//cdn.example/invite/:token?aid=${MASKED_VALUE}`],

    [
      'custom scheme with host',
      `futari://login-callback?code=${TOKEN}`,
      `futari://login-callback?code=${MASKED_VALUE}`,
    ],
    [
      'custom scheme with invite path',
      `futari://app/invite/${TOKEN}`,
      'futari://app/invite/:token',
    ],
    ['blob', `blob:https://futari.example/${TOKEN}`, 'blob:redacted'],
    ['data', `data:text/plain,${TOKEN}`, 'data:redacted'],
    ['javascript', `javascript:alert('${TOKEN}')`, 'javascript:redacted'],
    ['uppercase data scheme', `DATA:text/plain,${TOKEN}`, 'data:redacted'],
    ['mailto (opaque)', `mailto:${TOKEN}@example.com?subject=x`, 'mailto:redacted'],
    ['tel (opaque)', `tel:+886${AMOUNT}`, 'tel:redacted'],
    ['host:port without scheme reads as opaque', `localhost:3000/invite/${TOKEN}`, 'localhost:redacted'],

    ['malformed absolute', `http://[${TOKEN}/x`, REDACTED_URL],
    ['malformed protocol-relative', `//[${TOKEN}/x`, REDACTED_URL],
  ])('%s', (_name, input, expected) => {
    expect(sanitizeAnalyticsUrl(input)).toBe(expected)
  })
})

describe('sanitizeAnalyticsUrl — query keys', () => {
  it('keeps every allowlisted key', () => {
    const query = ANALYTICS_URL_PARAM_ALLOWLIST.map((k) => `${k}=v_${k}`).join('&')
    expect(sanitizeAnalyticsUrl(`/x?${query}`)).toBe(`/x?${query}`)
  })

  it('matches allowlisted keys case-insensitively', () => {
    expect(sanitizeAnalyticsUrl('/x?UTM_SOURCE=a&Tab=b')).toBe('/x?UTM_SOURCE=a&Tab=b')
  })

  it('matches percent-encoded allowlisted keys', () => {
    expect(sanitizeAnalyticsUrl('/x?utm%5Fsource=a')).toBe('/x?utm%5Fsource=a')
  })

  it('does not let an encoded key smuggle a non-allowlisted name past', () => {
    expect(sanitizeAnalyticsUrl(`/x?%6Eext=${TOKEN}`)).toBe(`/x?%6Eext=${MASKED_VALUE}`)
  })

  it('masks every occurrence of a repeated key', () => {
    expect(sanitizeAnalyticsUrl(`/x?fCat=a&fCat=${TOKEN}&tab=t&tab=u`)).toBe(
      `/x?fCat=${MASKED_VALUE}&fCat=${MASKED_VALUE}&tab=t&tab=u`,
    )
  })

  it('masks bare keys and empty values, and skips empty pairs', () => {
    expect(sanitizeAnalyticsUrl('/x?flag&&empty=&tab=')).toBe(
      `/x?flag=${MASKED_VALUE}&empty=${MASKED_VALUE}&tab=`,
    )
  })

  it('treats a malformed escape in a key as not allowlisted', () => {
    expect(sanitizeAnalyticsUrl(`/x?utm_source%=${TOKEN}`)).toBe(`/x?utm_source%=${MASKED_VALUE}`)
  })

  it('does not treat a value containing "=" as a second pair', () => {
    expect(sanitizeAnalyticsUrl(`/x?next=/a?tab=${TOKEN}`)).toBe(`/x?next=${MASKED_VALUE}`)
  })

  it('dropUnknown removes non-allowlisted pairs', () => {
    expect(
      sanitizeAnalyticsUrl(`https://a.example/r?gclid=${TOKEN}&utm_medium=cpc&fAmtMin=${AMOUNT}`, {
        dropUnknown: true,
      }),
    ).toBe('https://a.example/r?utm_medium=cpc')
  })

  it('dropUnknown removes the "?" when nothing survives', () => {
    expect(sanitizeAnalyticsUrl(`/r?gclid=${TOKEN}`, { dropUnknown: true })).toBe('/r')
  })

  it('is stable when fed its own output', () => {
    const once = sanitizeAnalyticsUrl(`https://a.example/invite/${TOKEN}?fQ=${TOKEN}&utm_id=7`)
    expect(sanitizeAnalyticsUrl(once)).toBe(once)
  })
})

describe('sanitizeAnalyticsUrl — never throws, never echoes', () => {
  // Deterministic PRNG so a failure is reproducible.
  function rng(seed: number) {
    return () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
  }
  const rand = rng(1274)
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]
  const junk = [
    'https://', 'http://', '//', 'futari://', 'blob:', 'data:', '/', '\\', '?', '#', '&', '=', '%', '%2',
    '%ZZ', '%00', '[', ']', '@', ':', ' ', '\u0000', '\uD800', '😀', '..', 'invite', 'INVITE', 'next',
    'utm_source', 'fAmtMin', '+', ';', '"', "'", '<', '>', TOKEN, AMOUNT,
  ]
  const origins = ['', 'https://h.example', 'http://localhost:3000', '//h.example', 'futari://app']
  // Path pieces that cannot move the secret out of the path (no `?`, `#`,
  // leading `//`): the secret's structural position is fixed, junk is not.
  const pathPieces = ['/a', '/x%20y', '/%ZZ', '/..', '/.', '/😀', '/invite', '/INVITE', '/%00', '/a;b', '/\uD800']
  const secrets = [`/invite/${TOKEN}`, `?next=/invite/${TOKEN}`, `?fAmtMin=${AMOUNT}`, `#${TOKEN}`, `?q=${TOKEN}&tab=1`]
  // The secrecy fuzz appends junk *without* secrets: junk glued onto an
  // allowlisted value (`&tab=1…`) is kept by contract, so a secret inside it
  // would be a test bug, not a leak.
  const junkWithoutSecrets = junk.filter((p) => p !== TOKEN && p !== AMOUNT)
  const junkString = (max: number, from: readonly string[] = junk) => {
    let out = ''
    for (let j = Math.floor(rand() * max); j > 0; j--) out += pick(from)
    return out
  }

  it('never throws and always returns a string, for arbitrary junk', () => {
    for (let i = 0; i < 3000; i++) {
      const input = junkString(16)
      let out: unknown
      expect(() => {
        out = sanitizeAnalyticsUrl(input, { dropUnknown: rand() < 0.3 })
      }, input).not.toThrow()
      expect(typeof out, input).toBe('string')
    }
  })

  it('never echoes a secret from its contract position, whatever surrounds it', () => {
    for (let i = 0; i < 3000; i++) {
      let prefix = pick(origins)
      for (let j = Math.floor(rand() * 4); j > 0; j--) prefix += pick(pathPieces)
      const secret = pick(secrets)
      const input = `${prefix}${secret}${junkString(8, junkWithoutSecrets)}`
      const out = sanitizeAnalyticsUrl(input, { dropUnknown: rand() < 0.3 })
      expect(out, input).not.toContain(TOKEN)
      expect(out, input).not.toContain(AMOUNT)
    }
  })

  it('returns "" for non-string values of every kind', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    const hostile = {
      toString() {
        throw new Error('boom')
      },
    }
    for (const value of [0, NaN, true, Symbol('s'), BigInt(10), [], [`/invite/${TOKEN}`], cyclic, hostile, () => TOKEN]) {
      expect(sanitizeAnalyticsUrl(value)).toBe('')
    }
  })

  it('returns the redacted form, not the input, when parsing fails', () => {
    const out = sanitizeAnalyticsUrl(`https://exa mple.com/invite/${TOKEN}`)
    expect(out).toBe(REDACTED_URL)
  })
})
