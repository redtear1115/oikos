import { describe, it, expect } from 'vitest'
import { INCOME_CATEGORIES, SAVINGS_RETURN_CATEGORIES, getIncomeCategory, isValidIncomeCategoryId } from '@/lib/incomeCategories'
import { lightenHex } from '@/lib/colors'

describe('INCOME_CATEGORIES', () => {
  it('exposes 10 entries (8 base + dividend + survival_annuity)', () => {
    expect(INCOME_CATEGORIES).toHaveLength(10)
  })

  it('every entry has the required token fields', () => {
    for (const c of INCOME_CATEGORIES) {
      expect(c.id).toBeTruthy()
      expect(c.label).toBeTruthy()
      expect(c.mono).toMatch(/^.$/)
      expect(c.color).toMatch(/^#[0-9A-F]{6}$/i)
      expect(c.tint).toMatch(/^#/)
      expect(c.ink).toMatch(/^#/)
      expect(c.chart).toMatch(/^#/)
    }
  })

  // Same contract as expense categories — see __tests__/categories.test.ts.
  it('derives tint from color and aliases chart = color', () => {
    for (const c of INCOME_CATEGORIES) {
      expect(c.chart).toBe(c.color)
      expect(c.tint).toBe(lightenHex(c.color))
    }
  })

  it('matches spec ids', () => {
    const ids = INCOME_CATEGORIES.map(c => c.id).sort()
    expect(ids).toEqual([
      'bonus', 'claim', 'dividend', 'gift', 'maturity',
      'other', 'refund', 'salary', 'sidehustle', 'survival_annuity',
    ])
  })
})

describe('SAVINGS_RETURN_CATEGORIES', () => {
  it('contains maturity + dividend + survival_annuity in stable order', () => {
    expect(SAVINGS_RETURN_CATEGORIES).toEqual(['maturity', 'dividend', 'survival_annuity'])
  })

  it('every entry is a valid IncomeCategoryId', () => {
    for (const c of SAVINGS_RETURN_CATEGORIES) {
      expect(isValidIncomeCategoryId(c)).toBe(true)
    }
  })
})

describe('getIncomeCategory', () => {
  it('returns the entry for a known id', () => {
    expect(getIncomeCategory('salary').label).toBe('薪水')
    expect(getIncomeCategory('maturity').mono).toBe('期')
  })

  it('falls back to other for unknown ids', () => {
    expect(getIncomeCategory('nonexistent').id).toBe('other')
  })
})

describe('isValidIncomeCategoryId', () => {
  it('accepts spec ids and rejects others', () => {
    expect(isValidIncomeCategoryId('claim')).toBe(true)
    expect(isValidIncomeCategoryId('labor')).toBe(false)  // pre-rewrite id
  })
})
