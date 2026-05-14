import { describe, it, expect } from 'vitest'
import { CURRENCIES, type CurrencyCode, currencyPrecision, formatAmount, convertAmount } from '@/lib/currency'

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

describe('convertAmount', () => {
  // Rate semantics: `rate` is "1 display unit of `from` = rate display units of `to`".
  // Display unit examples: 1 TWD, 1 USD ($1.00, NOT 1 cent), 1 JPY.

  it('same currency returns unchanged amount', () => {
    expect(convertAmount({ amount: 100, from: 'twd', to: 'twd', rate: 1 })).toBe(100)
  })

  it('TWD → JPY: 100 TWD × 5.0 = 500 JPY (both integer-unit)', () => {
    expect(convertAmount({ amount: 100, from: 'twd', to: 'jpy', rate: 5.0 })).toBe(500)
  })

  it('TWD → USD: 1000 TWD × 0.032 = $32.00 stored as 3200 cents', () => {
    expect(convertAmount({ amount: 1000, from: 'twd', to: 'usd', rate: 0.032 })).toBe(3200)
  })

  it('USD → TWD: $12.50 (1250 cents) × (1/0.032) ≈ 391 TWD', () => {
    expect(convertAmount({ amount: 1250, from: 'usd', to: 'twd', rate: 1 / 0.032 })).toBe(391)
  })

  it('JPY → TWD: 500 JPY × 0.2 = 100 TWD', () => {
    expect(convertAmount({ amount: 500, from: 'jpy', to: 'twd', rate: 0.2 })).toBe(100)
  })

  it('USD → JPY: $1.00 (100 cents) × 150 = ¥150', () => {
    expect(convertAmount({ amount: 100, from: 'usd', to: 'jpy', rate: 150 })).toBe(150)
  })

  it('TWD → CNY: 1000 TWD × 0.22 = 220 CNY', () => {
    expect(convertAmount({ amount: 1000, from: 'twd', to: 'cny', rate: 0.22 })).toBe(220)
  })

  it('rounds half to nearest integer for integer target', () => {
    expect(convertAmount({ amount: 100, from: 'twd', to: 'jpy', rate: 4.995 })).toBe(500)
  })
})
