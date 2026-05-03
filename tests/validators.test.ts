import { describe, it, expect } from 'vitest'
import {
  validateAmount,
  validateName,
  validateTransactionInput,
  validateSettlementInput,
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
    category: 'food',
    splitType: 'half' as const,
    payerId: 'user-a',
    transactedAt: new Date('2026-05-03'),
  }

  it('happy path: trims description, accepts valid category', () => {
    const r = validateTransactionInput(baseValid)
    expect(r.description).toBe('午餐')
    expect(r.category).toBe('food')
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
