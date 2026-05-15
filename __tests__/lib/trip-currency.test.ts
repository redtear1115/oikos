import { describe, it, expect } from 'vitest'
import {
  parseTripCurrencySnapshot,
  validateTripCurrencySnapshot,
  buildSnapshotFromCurrencyRates,
  findRate,
} from '@/lib/trip-currency'

describe('parseTripCurrencySnapshot', () => {
  it('parses new shape directly', () => {
    const raw = {
      default: 'TWD',
      entries: [
        { code: 'TWD', label: null, rate: 1 },
        { code: 'JPY', label: '日圓', rate: 0.22 },
      ],
    }
    const s = parseTripCurrencySnapshot(raw, 'TWD')
    expect(s.default).toBe('TWD')
    expect(s.entries).toHaveLength(2)
    expect(findRate(s, 'JPY')).toBe(0.22)
  })

  it('reconstructs from legacy `${FROM}_${TO}` shape using fallbackDefault', () => {
    const legacy = {
      TWD_JPY: 5,
      JPY_TWD: 0.2,
      USD_TWD: 32,
      TWD_USD: 0.031,
    }
    const s = parseTripCurrencySnapshot(legacy, 'TWD')
    expect(s.default).toBe('TWD')
    const byCode = Object.fromEntries(s.entries.map(e => [e.code, e.rate]))
    expect(byCode['TWD']).toBe(1)
    expect(byCode['JPY']).toBe(0.2)
    expect(byCode['USD']).toBe(32)
  })

  it('returns single-entry default when raw is null', () => {
    const s = parseTripCurrencySnapshot(null, 'usd')
    expect(s.default).toBe('USD')
    expect(s.entries).toEqual([{ code: 'USD', label: null, rate: 1 }])
  })

  it('uppercases codes in legacy keys', () => {
    const legacy = { jpy_twd: 0.22 }
    const s = parseTripCurrencySnapshot(legacy, 'twd')
    const jpy = s.entries.find(e => e.code === 'JPY')
    expect(jpy?.rate).toBe(0.22)
  })

  it('falls back to first entry when default in new shape is unknown', () => {
    const s = parseTripCurrencySnapshot(
      {
        default: 'XYZ',
        entries: [{ code: 'TWD', label: null, rate: 1 }],
      },
      'TWD',
    )
    expect(s.default).toBe('TWD')
  })
})

describe('validateTripCurrencySnapshot', () => {
  it('accepts a valid snapshot, uppercases + trims', () => {
    const s = validateTripCurrencySnapshot({
      default: ' twd ',
      entries: [
        { code: 'twd', label: ' 台幣 ', rate: 1 },
        { code: ' vnd', label: '', rate: 0.0013 },
      ],
    })
    expect(s.default).toBe('TWD')
    expect(s.entries).toEqual([
      { code: 'TWD', label: '台幣', rate: 1 },
      { code: 'VND', label: null, rate: 0.0013 },
    ])
  })

  it('forces default entry rate to 1 even if client sends otherwise', () => {
    const s = validateTripCurrencySnapshot({
      default: 'TWD',
      entries: [{ code: 'TWD', label: null, rate: 42 }],
    })
    expect(s.entries[0].rate).toBe(1)
  })

  it('rejects when default not in entries', () => {
    expect(() =>
      validateTripCurrencySnapshot({
        default: 'JPY',
        entries: [{ code: 'TWD', label: null, rate: 1 }],
      }),
    ).toThrow('預設幣別不在列表中')
  })

  it('rejects duplicate codes', () => {
    expect(() =>
      validateTripCurrencySnapshot({
        default: 'TWD',
        entries: [
          { code: 'TWD', label: null, rate: 1 },
          { code: 'twd', label: null, rate: 1 },
        ],
      }),
    ).toThrow('重複的幣別')
  })

  it('rejects non-positive rate', () => {
    expect(() =>
      validateTripCurrencySnapshot({
        default: 'TWD',
        entries: [
          { code: 'TWD', label: null, rate: 1 },
          { code: 'JPY', label: null, rate: 0 },
        ],
      }),
    ).toThrow('匯率必須是正數')
  })

  it('rejects > 5 entries', () => {
    const entries = Array.from({ length: 6 }, (_, i) => ({
      code: `C${i}`,
      label: null,
      rate: 1,
    }))
    entries[0].code = 'TWD'
    expect(() =>
      validateTripCurrencySnapshot({ default: 'TWD', entries }),
    ).toThrow('最多 5 個幣別')
  })

  it('rejects empty entries', () => {
    expect(() =>
      validateTripCurrencySnapshot({ default: 'TWD', entries: [] }),
    ).toThrow('至少需要一個幣別')
  })

  it('rejects > 16 char codes', () => {
    expect(() =>
      validateTripCurrencySnapshot({
        default: 'TWD',
        entries: [
          { code: 'TWD', label: null, rate: 1 },
          { code: 'VERYLONGCURRENCYCODE', label: null, rate: 1 },
        ],
      }),
    ).toThrow('幣別代碼過長')
  })
})

describe('buildSnapshotFromCurrencyRates', () => {
  it('builds entries for currencies with X→default rates only', () => {
    const rates = [
      { fromCurrency: 'twd', toCurrency: 'jpy', rate: '5.000' }, // ignored (no →TWD)
      { fromCurrency: 'jpy', toCurrency: 'twd', rate: '0.200' }, // → JPY entry
      { fromCurrency: 'usd', toCurrency: 'twd', rate: '32.000' }, // → USD entry
    ]
    const s = buildSnapshotFromCurrencyRates(rates, 'TWD')
    expect(s.default).toBe('TWD')
    const codes = s.entries.map(e => e.code).sort()
    expect(codes).toEqual(['JPY', 'TWD', 'USD'])
    expect(findRate(s, 'JPY')).toBe(0.2)
    expect(findRate(s, 'USD')).toBe(32)
  })

  it('emits only default entry when no rates supplied', () => {
    const s = buildSnapshotFromCurrencyRates([], 'TWD')
    expect(s.entries).toEqual([{ code: 'TWD', label: null, rate: 1 }])
  })
})

describe('findRate', () => {
  const snap = parseTripCurrencySnapshot(
    {
      default: 'TWD',
      entries: [
        { code: 'TWD', rate: 1, label: null },
        { code: 'JPY', rate: 0.22, label: null },
      ],
    },
    'TWD',
  )

  it('returns rate for known code (case-insensitive)', () => {
    expect(findRate(snap, 'jpy')).toBe(0.22)
    expect(findRate(snap, 'TWD')).toBe(1)
  })

  it('returns null for unknown code', () => {
    expect(findRate(snap, 'EUR')).toBeNull()
  })
})
