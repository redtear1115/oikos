import { describe, it, expect } from 'vitest'
import { CATEGORIES, getCategory, isValidCategoryId } from '@/lib/categories'
import { lightenHex } from '@/lib/colors'

describe('CATEGORIES', () => {
  it('has exactly 10 entries', () => {
    expect(CATEGORIES).toHaveLength(10)
  })

  it('each entry has required fields', () => {
    for (const c of CATEGORIES) {
      expect(c.id).toMatch(/^[a-z]+$/)
      expect(c.label).toBeTruthy()
      expect(c.mono).toBeTruthy()
      expect(c.color).toMatch(/^#[0-9A-F]{6}$/i)
      expect(c.tint).toMatch(/^#[0-9A-F]{6}$/i)
      expect(c.ink).toMatch(/^#[0-9A-F]{6}$/i)
      expect(c.chart).toMatch(/^#[0-9A-F]{6}$/i)
    }
  })

  // Issue #149 — chip tint must be a deterministic lightening of the
  // primary color so the chip in a feed and the donut slice on the same
  // screen always read as the same hue. Same for the chart alias.
  it('derives tint from color and aliases chart = color', () => {
    for (const c of CATEGORIES) {
      expect(c.chart).toBe(c.color)
      expect(c.tint).toBe(lightenHex(c.color))
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
