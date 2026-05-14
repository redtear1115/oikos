import { describe, it, expect } from 'vitest'
import { CURRENCIES, type CurrencyCode, currencyPrecision, formatAmount } from '@/lib/currency'

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

describe('formatAmount', () => {
  it('formats TWD as "NT$X" with thousand separators', () => {
    expect(formatAmount(12345, 'twd')).toBe('NT$12,345')
  })
  it('formats TWD zero', () => {
    expect(formatAmount(0, 'twd')).toBe('NT$0')
  })
  it('formats USD cents to dollars with 2 decimals and $ prefix', () => {
    expect(formatAmount(1250, 'usd')).toBe('$12.50')
  })
  it('formats USD with thousand separators', () => {
    expect(formatAmount(123456, 'usd')).toBe('$1,234.56')
  })
  it('formats JPY with ¥ prefix, no decimals', () => {
    expect(formatAmount(50000, 'jpy')).toBe('¥50,000')
  })
  it('formats CNY with CN¥ prefix', () => {
    expect(formatAmount(1000, 'cny')).toBe('CN¥1,000')
  })
  it('formats negative amounts with minus before symbol', () => {
    expect(formatAmount(-500, 'twd')).toBe('-NT$500')
  })
})
