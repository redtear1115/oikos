import { describe, it, expect } from 'vitest'
import {
  validateAmount,
  validateName,
  validateTransactionInput,
  validateSettlementInput,
  validateFuelLogInput,
  validateHouseInput,
} from '@/lib/validators'

describe('validateAmount', () => {
  it('accepts positive integer', () => expect(validateAmount(100)).toBe(100))
  it('rejects zero', () => expect(() => validateAmount(0)).toThrow(/金額必須是正整數/))
  it('rejects negative', () => expect(() => validateAmount(-5)).toThrow(/金額必須是正整數/))
  it('rejects float', () => expect(() => validateAmount(10.5)).toThrow(/金額必須是正整數/))
  it('respects custom field label', () => {
    expect(() => validateAmount(0, '欠款')).toThrow(/欠款必須是正整數/)
  })
})

describe('validateName', () => {
  it('trims and returns', () => expect(validateName('  Coco ', '名稱')).toBe('Coco'))
  it('rejects empty', () => expect(() => validateName('', '帳本名稱')).toThrow(/帳本名稱不能為空/))
  it('rejects whitespace-only', () => expect(() => validateName('   ', '帳本名稱')).toThrow(/帳本名稱不能為空/))
  it('rejects too long', () => {
    expect(() => validateName('x'.repeat(33), '帳本名稱')).toThrow(/帳本名稱最長 32 字/)
  })
  it('respects custom maxLen', () => {
    expect(() => validateName('xxx', '名', 2)).toThrow(/名最長 2 字/)
  })
  it('accepts at limit', () => {
    expect(validateName('x'.repeat(32), '名')).toBe('x'.repeat(32))
  })
})

describe('validateTransactionInput', () => {
  const baseValid = {
    amount: 100,
    description: ' 午餐 ',
    category: 'dining',
    splitType: 'half' as const,
    payerId: 'user-a',
    transactedAt: new Date('2026-05-03'),
  }

  it('happy path: trims description, accepts valid category', () => {
    const r = validateTransactionInput(baseValid)
    expect(r.description).toBe('午餐')
    expect(r.category).toBe('dining')
  })
  it('falls back unknown category to other', () => {
    const r = validateTransactionInput({ ...baseValid, category: 'bogus' })
    expect(r.category).toBe('other')
  })
  it('rejects empty description', () => {
    expect(() => validateTransactionInput({ ...baseValid, description: '   ' })).toThrow(/描述不能為空/)
  })
  it('rejects settle category', () => {
    expect(() => validateTransactionInput({ ...baseValid, category: 'settle' })).toThrow(/不可使用此分類/)
  })
  it('rejects invalid amount', () => {
    expect(() => validateTransactionInput({ ...baseValid, amount: 0 })).toThrow(/金額必須是正整數/)
  })
})

describe('validateSettlementInput', () => {
  const baseValid = {
    amount: 100,
    payerId: 'user-a',
    settledAt: new Date('2026-05-03'),
  }
  it('accepts minimal valid input', () => {
    const r = validateSettlementInput(baseValid)
    expect(r.amount).toBe(100)
    expect(r.note).toBeNull()
  })
  it('trims note and keeps non-empty', () => {
    const r = validateSettlementInput({ ...baseValid, note: ' partial ' })
    expect(r.note).toBe('partial')
  })
  it('whitespace-only note becomes null', () => {
    const r = validateSettlementInput({ ...baseValid, note: '   ' })
    expect(r.note).toBeNull()
  })
  it('rejects invalid amount', () => {
    expect(() => validateSettlementInput({ ...baseValid, amount: -1 })).toThrow(/金額必須是正整數/)
  })
})

describe('validateFuelLogInput', () => {
  const validBase = {
    assetId: '00000000-0000-0000-0000-000000000001',
    liters: 36.2,
    odometer: 86420,
    cost: 1340,
    fuelType: '95' as const,
    loggedAt: '2026-05-05',
    station: '中油 永和',
    paidBy: 'user-id',
    splitType: 'all_mine' as const,
  }

  it('accepts valid input', () => {
    const result = validateFuelLogInput(validBase)
    expect(result.liters).toBeCloseTo(36.2)
    expect(result.odometer).toBe(86420)
    expect(result.cost).toBe(1340)
    expect(result.station).toBe('中油 永和')
  })

  it('accepts null station', () => {
    const result = validateFuelLogInput({ ...validBase, station: null })
    expect(result.station).toBeNull()
  })

  it('rejects non-positive liters', () => {
    expect(() => validateFuelLogInput({ ...validBase, liters: 0 })).toThrow(/油量/)
    expect(() => validateFuelLogInput({ ...validBase, liters: -5 })).toThrow(/油量/)
  })

  it('rejects negative odometer', () => {
    expect(() => validateFuelLogInput({ ...validBase, odometer: -1 })).toThrow(/里程/)
  })

  it('rejects non-positive cost', () => {
    expect(() => validateFuelLogInput({ ...validBase, cost: 0 })).toThrow(/金額/)
  })

  it('rejects invalid fuelType', () => {
    expect(() => validateFuelLogInput({ ...validBase, fuelType: 'foo' as never })).toThrow(/油種/)
  })

  it('rejects fuelType=electric (FuelLog gas-only per EV1)', () => {
    expect(() => validateFuelLogInput({ ...validBase, fuelType: 'electric' as never })).toThrow(/電車/)
  })

  it('trims overlong station to <= 100 chars', () => {
    const long = 'x'.repeat(150)
    expect(() => validateFuelLogInput({ ...validBase, station: long })).toThrow(/加油站/)
  })

  it('rejects invalid loggedAt date', () => {
    expect(() => validateFuelLogInput({ ...validBase, loggedAt: 'not-a-date' })).toThrow(/日期/)
  })
})

describe('validateHouseInput', () => {
  it('accepts name only', () => {
    const r = validateHouseInput({ name: '我們家' })
    expect(r).toEqual({ name: '我們家', address: null, purchasedAt: null, purchasePrice: null })
  })

  it('trims and accepts all fields', () => {
    const r = validateHouseInput({
      name: ' 台北的家 ',
      address: ' 台北市大安區某路1號 ',
      purchasedAt: '2020-06-15',
      purchasePrice: 15000000,
    })
    expect(r).toEqual({
      name: '台北的家',
      address: '台北市大安區某路1號',
      purchasedAt: '2020-06-15',
      purchasePrice: 15000000,
    })
  })

  it('throws on empty name', () => {
    expect(() => validateHouseInput({ name: '   ' })).toThrow(/名稱/)
  })

  it('throws on name over 32 chars', () => {
    expect(() => validateHouseInput({ name: 'x'.repeat(33) })).toThrow(/名稱最長 32 字/)
  })

  it('throws on address over 80 chars', () => {
    expect(() => validateHouseInput({ name: '家', address: 'x'.repeat(81) })).toThrow(/地址最長 80 字/)
  })

  it('throws on invalid purchasedAt format', () => {
    expect(() => validateHouseInput({ name: '家', purchasedAt: '2020/06/15' })).toThrow(/日期格式/)
  })

  it('throws on non-positive purchasePrice', () => {
    expect(() => validateHouseInput({ name: '家', purchasePrice: 0 })).toThrow(/金額/)
  })
})
