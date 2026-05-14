import { describe, it, expect } from 'vitest'
import { CURRENCIES, type CurrencyCode } from '@/lib/currency'

describe('CURRENCIES constant', () => {
  it('contains the four MVP currencies in canonical order', () => {
    expect(CURRENCIES).toEqual(['twd', 'cny', 'usd', 'jpy'])
  })

  it('CurrencyCode type accepts the four codes', () => {
    const x: CurrencyCode = 'twd'
    const y: CurrencyCode = 'jpy'
    expect([x, y]).toEqual(['twd', 'jpy'])
  })
})
