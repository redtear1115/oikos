import { describe, it, expect } from 'vitest'
import {
  mapCategory,
  mapCwmoney,
  mapGeneric,
  mapHoneydue,
  mapSpendee,
  parseAmount,
  parseDate,
} from '@/lib/csvImport/mapper'

describe('parseDate', () => {
  it('parses yyyy-MM-dd', () => {
    const d = parseDate('2026-01-15')!
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(0)
    expect(d.getDate()).toBe(15)
  })

  it('parses yyyy/MM/dd', () => {
    const d = parseDate('2026/05/09')!
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(4)
    expect(d.getDate()).toBe(9)
  })

  it('parses yyyyMMdd compact', () => {
    const d = parseDate('20260301')!
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(2)
    expect(d.getDate()).toBe(1)
  })

  it('parses Honeydue US M/D/YYYY', () => {
    const d = parseDate('1/15/2026')!
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(0)
    expect(d.getDate()).toBe(15)
  })

  it('parses Unix ms epoch (CWMoney i_date)', () => {
    const d = parseDate(String(Date.UTC(2026, 0, 15)))!
    expect(d.getUTCFullYear()).toBe(2026)
  })

  it('rejects invalid calendar dates', () => {
    expect(parseDate('2026-02-30')).toBeNull()
    expect(parseDate('2026-13-01')).toBeNull()
  })

  it('returns null for blank or junk input', () => {
    expect(parseDate('')).toBeNull()
    expect(parseDate('   ')).toBeNull()
    expect(parseDate('not-a-date')).toBeNull()
  })
})

describe('parseAmount', () => {
  it('parses plain positive integers', () => {
    expect(parseAmount('250')).toEqual({ value: 250, isNegative: false })
  })

  it('parses negative integers as expense signal', () => {
    expect(parseAmount('-100')).toEqual({ value: 100, isNegative: true })
  })

  it('strips comma thousands separators', () => {
    expect(parseAmount('1,200')).toEqual({ value: 1200, isNegative: false })
  })

  it('rounds decimals to nearest integer', () => {
    expect(parseAmount('1.49')).toEqual({ value: 1, isNegative: false })
    expect(parseAmount('1.50')).toEqual({ value: 2, isNegative: false })
  })

  it('treats parentheses as negative (accountant notation)', () => {
    expect(parseAmount('(50)')).toEqual({ value: 50, isNegative: true })
  })

  it('strips currency symbols', () => {
    expect(parseAmount('$1,200')).toEqual({ value: 1200, isNegative: false })
    expect(parseAmount('NT$500')).toEqual({ value: 500, isNegative: false })
  })

  it('returns null for blank or junk', () => {
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
  })
})

describe('mapCategory', () => {
  it('passes through valid Futari category ids', () => {
    expect(mapCategory('dining')).toBe('dining')
    expect(mapCategory('housing')).toBe('housing')
  })

  it('maps English synonyms (Honeydue / Spendee)', () => {
    expect(mapCategory('Food & Dining')).toBe('dining')
    expect(mapCategory('Groceries')).toBe('dining')
    expect(mapCategory('Transportation')).toBe('transit')
    expect(mapCategory('Rent')).toBe('housing')
  })

  it('maps 中文 synonyms (CWMoney)', () => {
    expect(mapCategory('飲食')).toBe('dining')
    expect(mapCategory('交通')).toBe('transit')
    expect(mapCategory('娛樂')).toBe('entertainment')
  })

  it('falls back to other for unknown or blank', () => {
    expect(mapCategory('')).toBe('other')
    expect(mapCategory(undefined)).toBe('other')
    expect(mapCategory('Cryptocurrency')).toBe('other')
  })
})

describe('mapHoneydue', () => {
  it('maps a typical Honeydue expense row', () => {
    const out = mapHoneydue({
      Date: '1/15/2026',
      Name: 'Costco run',
      Category: 'Groceries',
      Amount: '-120.50',
      Account: 'Joint',
    })
    expect(out.date?.getFullYear()).toBe(2026)
    expect(out.amount).toBe(121)
    expect(out.type).toBe('expense')
    expect(out.category).toBe('dining')
    expect(out.description).toBe('Costco run')
    expect(out.paidBy).toBe('viewer')
    expect(out.splitType).toBe('half')
  })

  it('maps a positive amount as income', () => {
    const out = mapHoneydue({
      Date: '1/20/2026', Name: 'Salary', Category: 'Income', Amount: '4000', Account: '',
    })
    expect(out.type).toBe('income')
    expect(out.amount).toBe(4000)
  })
})

describe('mapSpendee', () => {
  it('uses Type column as authoritative expense/income marker', () => {
    const out = mapSpendee({
      Date: '2026-01-15', Wallet: 'Cash', Type: 'Expense', 'Category name': 'Coffee',
      Amount: '120', Currency: 'TWD', Note: 'iced latte',
    })
    expect(out.type).toBe('expense')
    expect(out.amount).toBe(120)
    expect(out.originalCurrency).toBe('TWD')
    expect(out.originalAmount).toBe(120)
    expect(out.description).toBe('iced latte')
  })

  it('maps income rows', () => {
    const out = mapSpendee({
      Date: '2026-02-01', Wallet: 'Bank', Type: 'Income', 'Category name': 'Salary',
      Amount: '40000', Currency: '', Note: '',
    })
    expect(out.type).toBe('income')
    expect(out.originalCurrency).toBeUndefined()
  })
})

describe('mapCwmoney', () => {
  it('maps a 中文-header CWMoney row', () => {
    const out = mapCwmoney({
      日期: '2026/05/09', 類別: '餐飲', 項目: '午餐', 金額: '250', 帳戶: '現金',
    })
    expect(out.date?.getDate()).toBe(9)
    expect(out.amount).toBe(250)
    expect(out.type).toBe('expense')
    expect(out.category).toBe('dining')
    expect(out.description).toBe('午餐')
  })

  it('maps a raw i_* VIP-export row with i_type=1 as income', () => {
    const out = mapCwmoney({
      i_date: String(Date.UTC(2026, 4, 9)),
      i_kind: '薪資',
      i_money: '40000',
      i_type: '1',
      i_note: '5 月薪',
    })
    expect(out.type).toBe('income')
    expect(out.amount).toBe(40000)
    expect(out.description).toBe('5 月薪')
  })
})

describe('mapGeneric', () => {
  it('maps via an explicit header map', () => {
    const out = mapGeneric(
      { 日期: '2026-05-09', 類型: '支出', 金額: '250', 類別: '餐飲', 備註: '午餐' },
      { date: '日期', amount: '金額', type: '類型', category: '類別', description: '備註' },
    )
    expect(out.date?.getDate()).toBe(9)
    expect(out.amount).toBe(250)
    expect(out.type).toBe('expense')
    expect(out.category).toBe('dining')
    expect(out.description).toBe('午餐')
  })

  it('infers type from amount sign when type column missing', () => {
    const out = mapGeneric(
      { d: '2026-01-01', a: '-100' },
      { date: 'd', amount: 'a' },
    )
    expect(out.type).toBe('expense')
  })

  it('captures multi-currency when currency column present', () => {
    const out = mapGeneric(
      { d: '2026-01-01', a: '500', cur: 'usd' },
      { date: 'd', amount: 'a', currency: 'cur' },
    )
    expect(out.originalCurrency).toBe('USD')
    expect(out.originalAmount).toBe(500)
  })
})
