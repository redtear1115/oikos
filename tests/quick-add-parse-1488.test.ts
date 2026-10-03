import { describe, it, expect } from 'vitest'
import { parseQuickAddHash, parseQuickAddSchemeUrl, QUICK_ADD_NOTE_MAX } from '@/lib/quickAdd'

// #1488 — every value in a quick-add URL is untrusted (anyone can craft a
// link). These pin what the parser accepts, and that a bad value drops only
// itself while a URL that is not ours yields null.

const S = 'dev.southernlight.futari://add'

describe('parseQuickAddSchemeUrl — which URLs are ours', () => {
  it('accepts the add host and reads amount / category / note', () => {
    expect(parseQuickAddSchemeUrl(`${S}?amount=120&category=dining&note=${encodeURIComponent('午餐 LINE Pay')}`))
      .toEqual({ amount: 120, category: 'dining', description: '午餐 LINE Pay' })
  })

  it('a bare add URL opens an empty sheet', () => {
    expect(parseQuickAddSchemeUrl(S)).toEqual({})
  })

  it.each([
    ['userinfo moves the host', 'dev.southernlight.futari://add@evil.com?amount=1'],
    ['empty host (//add)', 'dev.southernlight.futari:////add?amount=1'],
    ['empty host (/add path)', 'dev.southernlight.futari:///add?amount=1'],
    ['host is case-sensitive (opaque host)', 'dev.southernlight.futari://ADD?amount=1'],
    ['the OAuth callback', 'dev.southernlight.futari://login-callback?code=x'],
    ['the OAuth callback with path', 'dev.southernlight.futari://login-callback/auth/callback?code=x&next=%2Fdashboard'],
    ['unknown host', 'dev.southernlight.futari://settings?amount=1'],
    ['add as a subdomain', 'dev.southernlight.futari://add.evil.com?amount=1'],
    ['other scheme', 'https://add?amount=1'],
    ['look-alike scheme', 'dev.southernlight.futarix://add?amount=1'],
    ['not a URL', 'add?amount=1'],
    ['empty', ''],
  ])('rejects %s', (_label, url) => {
    expect(parseQuickAddSchemeUrl(url)).toBeNull()
  })

  it('ignores the path and never reads values from it', () => {
    expect(parseQuickAddSchemeUrl(`${S}/amount/999?amount=5`)).toEqual({ amount: 5 })
  })

  it('never takes id / kind / tripId / payer / split / date / currency', () => {
    const p = parseQuickAddSchemeUrl(
      `${S}?amount=1&id=x&kind=trip-expense&tripId=t&payer=u&paidBy=u&split=all_theirs&date=2020-01-01&currency=usd`,
    )
    expect(p).toEqual({ amount: 1 })
  })
})

describe('amount', () => {
  const amount = (v: string) => parseQuickAddSchemeUrl(`${S}?amount=${encodeURIComponent(v)}`)?.amount

  it.each([
    ['120', 120],
    ['1,200', 1200],
    ['１２０', 120],
    ['１,２００', 1200],
    [' 85 ', 85],
    ['9999999', 9_999_999],
  ])('%s → %s', (v, expected) => {
    expect(amount(v)).toBe(expected)
  })

  it.each(['1e5', '-5', '0', '10000000', '1.5', '0x10', '', ',', 'abc', 'NaN', 'Infinity', '12 34', '99999999999999999999'])(
    'drops %j',
    (v) => {
      expect(amount(v)).toBeUndefined()
    },
  )

  it('a dropped amount does not drop the rest', () => {
    expect(parseQuickAddSchemeUrl(`${S}?amount=-5&category=transit`)).toEqual({ category: 'transit' })
  })
})

describe('category', () => {
  const category = (v: string) => parseQuickAddSchemeUrl(`${S}?category=${encodeURIComponent(v)}`)?.category

  it('accepts a pickable id exactly', () => {
    expect(category('dining')).toBe('dining')
  })

  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'settle', 'Dining', 'dining ', ''])(
    'drops %j',
    (v) => {
      expect(category(v)).toBeUndefined()
    },
  )
})

describe('note → description', () => {
  const note = (v: string) => parseQuickAddSchemeUrl(`${S}?note=${encodeURIComponent(v)}`)?.description

  it(`caps at ${QUICK_ADD_NOTE_MAX} code points without splitting a surrogate pair`, () => {
    const out = note('😀'.repeat(150))!
    expect(Array.from(out)).toHaveLength(QUICK_ADD_NOTE_MAX)
    expect(out).toBe('😀'.repeat(QUICK_ADD_NOTE_MAX))
  })

  it('caps an oversized plain note', () => {
    expect(note('a'.repeat(5000))).toBe('a'.repeat(QUICK_ADD_NOTE_MAX))
  })

  it('strips bidi overrides / isolates / marks', () => {
    expect(note('‮abc‬⁦x⁩‏')).toBe('abcx')
  })

  it('strips control characters and trims', () => {
    expect(note('  午餐\u0000\n\t\u007F\u0085 ')).toBe('午餐')
  })

  it('an all-stripped note is dropped', () => {
    expect(note('‮\u0000  ')).toBeUndefined()
  })
})

describe('parseQuickAddHash', () => {
  it('accepts add=expense', () => {
    expect(parseQuickAddHash('#add=expense&amount=120&category=dining&note=%E5%8D%88%E9%A4%90'))
      .toEqual({ amount: 120, category: 'dining', description: '午餐' })
  })

  it('works without the leading #', () => {
    expect(parseQuickAddHash('add=expense&amount=1')).toEqual({ amount: 1 })
  })

  it.each(['', '#', '#amount=1', '#add=income&amount=1', '#add=Expense&amount=1', '#section-2'])(
    'rejects %j',
    (h) => {
      expect(parseQuickAddHash(h)).toBeNull()
    },
  )

  it('applies the same value rules', () => {
    expect(parseQuickAddHash('#add=expense&amount=1e5&category=__proto__&tripId=t')).toEqual({})
  })
})
