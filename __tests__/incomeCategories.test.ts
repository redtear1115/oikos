import { describe, it, expect } from 'vitest'
import { INCOME_CATEGORIES, getIncomeCategory, isValidIncomeCategoryId } from '@/lib/incomeCategories'

describe('INCOME_CATEGORIES', () => {
  it('has exactly 9 entries', () => {
    expect(INCOME_CATEGORIES).toHaveLength(9)
  })

  it('each entry has required fields', () => {
    for (const c of INCOME_CATEGORIES) {
      expect(c.id).toMatch(/^[a-z]+$/)
      expect(c.label).toBeTruthy()
      expect(c.mono).toBeTruthy()
      expect(c.tint).toMatch(/^#[0-9A-F]{6}$/i)
      expect(c.ink).toMatch(/^#[0-9A-F]{6}$/i)
      expect(c.chart).toMatch(/^#[0-9A-F]{6}$/i)
    }
  })

  it('contains expected ids', () => {
    const ids = INCOME_CATEGORIES.map(c => c.id)
    expect(ids).toEqual(['labor', 'investment', 'rental', 'interest', 'subsidy', 'sale', 'loan', 'business', 'other'])
  })
})

describe('getIncomeCategory', () => {
  it('returns category by id', () => {
    expect(getIncomeCategory('labor').label).toBe('勞務')
  })

  it('returns "other" for unknown id', () => {
    expect(getIncomeCategory('nonexistent').id).toBe('other')
  })
})

describe('isValidIncomeCategoryId', () => {
  it('returns true for known ids', () => {
    expect(isValidIncomeCategoryId('labor')).toBe(true)
  })
  it('returns false for unknown', () => {
    expect(isValidIncomeCategoryId('xyz')).toBe(false)
  })
})
