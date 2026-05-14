import { describe, it, expect } from 'vitest'
import { defaultRatesFor } from '@/lib/db/queries/currencyRates'
import type { CurrencyCode } from '@/lib/currency'

describe('defaultRatesFor', () => {
  it('returns 3 default rates when base is TWD', () => {
    const rates = defaultRatesFor('twd')
    expect(rates).toEqual([
      { fromCurrency: 'twd', toCurrency: 'cny', rate: '0.220' },
      { fromCurrency: 'twd', toCurrency: 'usd', rate: '0.032' },
      { fromCurrency: 'twd', toCurrency: 'jpy', rate: '5.000' },
    ])
  })

  it('returns 3 default rates when base is JPY', () => {
    const rates = defaultRatesFor('jpy')
    expect(rates.map(r => r.toCurrency)).toEqual(['twd', 'cny', 'usd'])
    expect(rates.every(r => r.fromCurrency === 'jpy')).toBe(true)
  })

  it('never includes self-rate', () => {
    for (const base of ['twd', 'cny', 'usd', 'jpy'] as CurrencyCode[]) {
      const rates = defaultRatesFor(base)
      expect(rates.find(r => r.toCurrency === base)).toBeUndefined()
    }
  })

  it('JPY → TWD rate is reciprocal of TWD → JPY (5.0 → 0.200)', () => {
    const rates = defaultRatesFor('jpy')
    const jpyToTwd = rates.find(r => r.toCurrency === 'twd')
    expect(jpyToTwd?.rate).toBe('0.200')
  })
})
