import { describe, it, expect } from 'vitest'
import { INCOME_CATEGORIES, getIncomeCategory, isValidIncomeCategoryId } from '@/lib/incomeCategories'

describe('INCOME_CATEGORIES', () => {
  it('exposes 8 entries (no settle equivalent)', () => {
    expect(INCOME_CATEGORIES).toHaveLength(8)
  })

  it('every entry has the required token fields', () => {
    for (const c of INCOME_CATEGORIES) {
      expect(c.id).toBeTruthy()
      expect(c.label).toBeTruthy()
      expect(c.mono).toMatch(/^.$/)
      expect(c.tint).toMatch(/^#/)
      expect(c.ink).toMatch(/^#/)
      expect(c.chart).toMatch(/^#/)
    }
  })

  it('matches spec ids', () => {
    const ids = INCOME_CATEGORIES.map(c => c.id).sort()
    expect(ids).toEqual(['bonus', 'claim', 'gift', 'maturity', 'other', 'refund', 'salary', 'sidehustle'])
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
