import { describe, it, expect } from 'vitest'
import { CURRENCIES, type CurrencyCode, currencyPrecision } from '@/lib/currency'

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

describe('currencyPrecision', () => {
  it('USD has 2 decimal places (cent storage)', () => {
    expect(currencyPrecision('usd')).toBe(2)
  })
  it('TWD has 0 decimal places (integer NTD)', () => {
    expect(currencyPrecision('twd')).toBe(0)
  })
  it('CNY has 0 decimal places', () => {
    expect(currencyPrecision('cny')).toBe(0)
  })
  it('JPY has 0 decimal places', () => {
    expect(currencyPrecision('jpy')).toBe(0)
  })
})
