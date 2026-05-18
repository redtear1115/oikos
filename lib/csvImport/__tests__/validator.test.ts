import { describe, it, expect } from 'vitest'
import { validateRow } from '@/lib/csvImport/validator'
import type { PartialImportRow } from '@/lib/csvImport/types'

const good: PartialImportRow = {
  date: new Date(2026, 0, 15),
  amount: 250,
  type: 'expense',
  category: 'dining',
  description: '午餐',
  paidBy: 'viewer',
  splitType: 'half',
}

describe('validateRow', () => {
  it('returns ok for a well-formed row', () => {
    const out = validateRow(good, 0)
    expect(out.ok).toBe(true)
    expect(out.errors).toEqual([])
    expect(out.warnings).toEqual([])
  })

  it('errors on missing date', () => {
    const out = validateRow({ ...good, date: undefined }, 0)
    expect(out.ok).toBe(false)
    expect(out.errors.some(e => /date/.test(e))).toBe(true)
  })

  it('warns on future date beyond grace window', () => {
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    const out = validateRow({ ...good, date: future }, 0)
    expect(out.ok).toBe(true)
    expect(out.warnings.some(w => /future/.test(w))).toBe(true)
  })

  it('errors on non-integer amount', () => {
    const out = validateRow({ ...good, amount: 1.5 }, 0)
    expect(out.ok).toBe(false)
    expect(out.errors.some(e => /integer/.test(e))).toBe(true)
  })

  it('errors on zero or negative amount', () => {
    expect(validateRow({ ...good, amount: 0 }, 0).ok).toBe(false)
    expect(validateRow({ ...good, amount: -5 }, 0).ok).toBe(false)
  })

  it('errors when amount exceeds max', () => {
    const out = validateRow({ ...good, amount: 10_000_000 }, 0)
    expect(out.ok).toBe(false)
    expect(out.errors.some(e => /max/.test(e))).toBe(true)
  })

  it('errors on missing type', () => {
    const out = validateRow({ ...good, type: undefined }, 0)
    expect(out.ok).toBe(false)
  })

  it('warns (does not error) on unknown category — mapper already falls back to other', () => {
    const out = validateRow({ ...good, category: 'cryptocurrency' }, 0)
    expect(out.ok).toBe(true)
    expect(out.warnings.some(w => /unknown category/.test(w))).toBe(true)
  })

  it('warns on empty description', () => {
    const out = validateRow({ ...good, description: '' }, 0)
    expect(out.ok).toBe(true)
    expect(out.warnings.some(w => /description is empty/.test(w))).toBe(true)
  })

  it('errors on description > 500 chars', () => {
    const out = validateRow({ ...good, description: 'x'.repeat(501) }, 0)
    expect(out.ok).toBe(false)
  })

  it('errors when only one of originalCurrency / originalAmount is set', () => {
    const out = validateRow({ ...good, originalCurrency: 'USD' }, 0)
    expect(out.ok).toBe(false)
    expect(out.errors.some(e => /originalCurrency and originalAmount/.test(e))).toBe(true)
  })

  it('row index 0-based becomes 1-based in error messages', () => {
    const out = validateRow({ ...good, amount: 0 }, 4)
    expect(out.errors[0]).toContain('row 5')
  })
})
