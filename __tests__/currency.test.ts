import { describe, it, expect } from 'vitest'
import { CURRENCIES, type CurrencyCode, currencyPrecision, formatAmount, formatAmountParts, formatLedgerAmount, formatLedgerAmountParts, convertWholeUnits, minorToWhole, parseCurrencyCode } from '@/lib/currency'

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

describe('formatAmountParts', () => {
  it('splits TWD into sign/symbol/digits', () => {
    expect(formatAmountParts(12345, 'twd')).toEqual({ sign: '', symbol: 'NT$', digits: '12,345' })
  })
  it('splits negative amounts with a sign part', () => {
    expect(formatAmountParts(-500, 'twd')).toEqual({ sign: '-', symbol: 'NT$', digits: '500' })
  })
  it('splits USD cents to dollars with 2 decimals', () => {
    expect(formatAmountParts(1250, 'usd')).toEqual({ sign: '', symbol: '$', digits: '12.50' })
  })
  it('formatAmount composes byte-identically from the same parts', () => {
    for (const [amount, currency] of [
      [12345, 'twd'],
      [0, 'twd'],
      [1250, 'usd'],
      [123456, 'usd'],
      [50000, 'jpy'],
      [1000, 'cny'],
      [-500, 'twd'],
    ] as const) {
      const { sign, symbol, digits } = formatAmountParts(amount, currency)
      expect(formatAmount(amount, currency)).toBe(`${sign}${symbol}${digits}`)
    }
  })
})

describe('formatLedgerAmount (#1482: main-ledger integers, whole units)', () => {
  it('TWD is byte-identical to the minor-unit path', () => {
    for (const n of [0, 500, 12345, -500, 1234567]) {
      expect(formatLedgerAmount(n, 'twd')).toBe(formatAmount(n, 'twd'))
      expect(formatLedgerAmountParts(n, 'twd')).toEqual(formatAmountParts(n, 'twd'))
    }
  })
  it('USD base: $45 stays $45, not $0.45', () => {
    expect(formatLedgerAmount(45, 'usd')).toBe('$45')
    expect(formatLedgerAmount(1234, 'usd')).toBe('$1,234')
    expect(formatLedgerAmount(-45, 'usd')).toBe('-$45')
    expect(formatLedgerAmountParts(45, 'usd')).toEqual({ sign: '', symbol: '$', digits: '45' })
  })
  it('JPY / CNY base use their symbol, whole units', () => {
    expect(formatLedgerAmount(50000, 'jpy')).toBe('¥50,000')
    expect(formatLedgerAmount(1000, 'cny')).toBe('CN¥1,000')
  })
  it('the FX path keeps minor units: same number, different source, different text', () => {
    expect(formatAmount(4500, 'usd')).toBe('$45.00')
    expect(formatLedgerAmount(4500, 'usd')).toBe('$4,500')
    expect(formatAmount(45, 'usd')).toBe('$0.45')
  })
})

describe('convertWholeUnits', () => {
  // Ledger amounts are whole units of every currency (#1582). `rate` is the
  // composite "1 whole source unit = rate whole target units".
  it('TWD → JPY: 100 x 5 = 500', () => {
    expect(convertWholeUnits(100, 5)).toBe(500)
  })
  it('USD → TWD: $45 x 32 = 1440 (not 14.40 and not 144000)', () => {
    expect(convertWholeUnits(45, 32)).toBe(1440)
  })
  it('JPY → USD: 1000 x 0.0067 = 7', () => {
    expect(convertWholeUnits(1000, 0.0067)).toBe(7)
  })
  it('TWD → USD: 1000 x 0.032 = $32', () => {
    expect(convertWholeUnits(1000, 0.032)).toBe(32)
  })
  it('rounds half up', () => {
    expect(convertWholeUnits(100, 4.995)).toBe(500)
    expect(convertWholeUnits(45, 0.5)).toBe(23)
  })
  it('minimum 1: a positive amount never converts to 0', () => {
    expect(convertWholeUnits(15, 0.031)).toBe(1)
    expect(convertWholeUnits(50, 0.0067)).toBe(1)
    expect(convertWholeUnits(1, 0.0001)).toBe(1)
  })
  it('zero stays zero', () => {
    expect(convertWholeUnits(0, 32)).toBe(0)
  })
})

describe('minorToWhole', () => {
  it('USD cents → whole dollars, half up', () => {
    expect(minorToWhole(2250, 'usd')).toBe(23)
    expect(minorToWhole(4500, 'usd')).toBe(45)
    expect(minorToWhole(40, 'usd')).toBe(0)
    expect(minorToWhole(49, 'usd')).toBe(0)
    expect(minorToWhole(50, 'usd')).toBe(1)
  })
  it('precision-0 currencies pass through', () => {
    expect(minorToWhole(1500, 'twd')).toBe(1500)
    expect(minorToWhole(1500, 'jpy')).toBe(1500)
  })
})

describe('parseCurrencyCode', () => {
  it('accepts canonical lowercase codes', () => {
    expect(parseCurrencyCode('twd')).toBe('twd')
    expect(parseCurrencyCode('cny')).toBe('cny')
    expect(parseCurrencyCode('usd')).toBe('usd')
    expect(parseCurrencyCode('jpy')).toBe('jpy')
  })

  it('normalizes uppercase / mixed case to lowercase', () => {
    expect(parseCurrencyCode('TWD')).toBe('twd')
    expect(parseCurrencyCode('Usd')).toBe('usd')
  })

  it('returns null for unknown currency codes (free-text trip currencies, typos)', () => {
    expect(parseCurrencyCode('eur')).toBeNull()
    expect(parseCurrencyCode('vnd')).toBeNull()
    expect(parseCurrencyCode('xyz')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseCurrencyCode('')).toBeNull()
  })

  it('returns null for non-string inputs', () => {
    expect(parseCurrencyCode(null)).toBeNull()
    expect(parseCurrencyCode(undefined)).toBeNull()
    expect(parseCurrencyCode(123)).toBeNull()
    expect(parseCurrencyCode({})).toBeNull()
  })
})
