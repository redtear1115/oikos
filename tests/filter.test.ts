import { describe, it, expect } from 'vitest'
import { defaultFilter, isFilterActive, hidesSettlements, toWire, fromWire } from '@/lib/filter'

describe('defaultFilter', () => {
  it('is inactive', () => {
    expect(isFilterActive(defaultFilter())).toBe(false)
  })
  it('does not hide settlements', () => {
    expect(hidesSettlements(defaultFilter())).toBe(false)
  })
})

describe('isFilterActive', () => {
  it('payer alone activates', () => {
    expect(isFilterActive({ ...defaultFilter(), payer: 'mine' })).toBe(true)
  })
  it('split alone activates', () => {
    expect(isFilterActive({ ...defaultFilter(), split: 'half' })).toBe(true)
  })
  it('categories alone activates', () => {
    expect(isFilterActive({ ...defaultFilter(), categories: new Set(['food']) })).toBe(true)
  })
})

describe('hidesSettlements', () => {
  it('payer-only does NOT hide settlements (settlements have a payer)', () => {
    expect(hidesSettlements({ ...defaultFilter(), payer: 'mine' })).toBe(false)
  })
  it('split active hides settlements', () => {
    expect(hidesSettlements({ ...defaultFilter(), split: 'half' })).toBe(true)
  })
  it('categories active hides settlements', () => {
    expect(hidesSettlements({ ...defaultFilter(), categories: new Set(['food']) })).toBe(true)
  })
})

describe('wire round-trip', () => {
  it('preserves all dimensions', () => {
    const f = { payer: 'theirs' as const, split: 'half' as const, categories: new Set(['food', 'transit'] as const) }
    expect(fromWire(toWire(f))).toEqual(f)
  })
})
