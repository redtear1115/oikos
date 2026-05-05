import { describe, it, expect } from 'vitest'
import { CATEGORIES, getCategory, isValidCategoryId } from '@/lib/categories'

describe('CATEGORIES', () => {
  it('has exactly 10 entries', () => {
    expect(CATEGORIES).toHaveLength(10)
  })

  it('each entry has required fields', () => {
    for (const c of CATEGORIES) {
      expect(c.id).toMatch(/^[a-z]+$/)
      expect(c.label).toBeTruthy()
      expect(c.mono).toBeTruthy()
      expect(c.tint).toMatch(/^#[0-9A-F]{6}$/i)
      expect(c.ink).toMatch(/^#[0-9A-F]{6}$/i)
      expect(c.chart).toMatch(/^#[0-9A-F]{6}$/i)
    }
  })

  it('contains expected ids', () => {
    const ids = CATEGORIES.map(c => c.id)
    expect(ids).toEqual(['dining', 'clothing', 'housing', 'transit', 'education', 'entertainment', 'health', 'financial', 'other', 'settle'])
  })
})

describe('getCategory', () => {
  it('returns category by id', () => {
    expect(getCategory('dining').label).toBe('飲食')
  })

  it('returns "other" for unknown id', () => {
    expect(getCategory('nonexistent').id).toBe('other')
  })
})

describe('isValidCategoryId', () => {
  it('returns true for known ids', () => {
    expect(isValidCategoryId('dining')).toBe(true)
    expect(isValidCategoryId('settle')).toBe(true)
  })
  it('returns false for unknown', () => {
    expect(isValidCategoryId('xyz')).toBe(false)
  })
})
