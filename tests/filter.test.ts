import { describe, it, expect } from 'vitest'
import { defaultFilter, isFilterActive, hidesSettlements, toWire, fromWire, matchesFilter, type FilterableRow } from '@/lib/filter'

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

const txMine: FilterableRow = { paidBy: 'me', splitType: 'half', category: 'food', kind: 'transaction' }
const txTheirs: FilterableRow = { paidBy: 'them', splitType: 'all_theirs', category: 'transit', kind: 'transaction' }
const settleMine: FilterableRow = { paidBy: 'me', splitType: null, category: 'settle', kind: 'settlement' }
const settleTheirs: FilterableRow = { paidBy: 'them', splitType: null, category: 'settle', kind: 'settlement' }

describe('matchesFilter — payer dimension', () => {
  it('all → all rows pass', () => {
    const f = defaultFilter()
    expect(matchesFilter(txMine, f, 'me', 'them')).toBe(true)
    expect(matchesFilter(txTheirs, f, 'me', 'them')).toBe(true)
    expect(matchesFilter(settleMine, f, 'me', 'them')).toBe(true)
  })
  it('mine → only my rows', () => {
    const f = { ...defaultFilter(), payer: 'mine' as const }
    expect(matchesFilter(txMine, f, 'me', 'them')).toBe(true)
    expect(matchesFilter(txTheirs, f, 'me', 'them')).toBe(false)
    expect(matchesFilter(settleMine, f, 'me', 'them')).toBe(true)
    expect(matchesFilter(settleTheirs, f, 'me', 'them')).toBe(false)
  })
  it('theirs with no partner → nothing passes', () => {
    const f = { ...defaultFilter(), payer: 'theirs' as const }
    expect(matchesFilter(txTheirs, f, 'me', null)).toBe(false)
  })
  it('theirs with partner → only partner rows', () => {
    const f = { ...defaultFilter(), payer: 'theirs' as const }
    expect(matchesFilter(txTheirs, f, 'me', 'them')).toBe(true)
    expect(matchesFilter(txMine, f, 'me', 'them')).toBe(false)
  })
})

describe('matchesFilter — split dimension', () => {
  it('all → tx + settle pass', () => {
    const f = defaultFilter()
    expect(matchesFilter(txMine, f, 'me', 'them')).toBe(true)
    expect(matchesFilter(settleMine, f, 'me', 'them')).toBe(true)
  })
  it('half → only half tx; settle dropped', () => {
    const f = { ...defaultFilter(), split: 'half' as const }
    expect(matchesFilter(txMine, f, 'me', 'them')).toBe(true)        // half
    expect(matchesFilter(txTheirs, f, 'me', 'them')).toBe(false)     // all_theirs
    expect(matchesFilter(settleMine, f, 'me', 'them')).toBe(false)   // settlements dropped
  })
})

describe('matchesFilter — category dimension', () => {
  it('food selected → only food tx; settle dropped', () => {
    const f = { ...defaultFilter(), categories: new Set(['food'] as const) }
    expect(matchesFilter(txMine, f, 'me', 'them')).toBe(true)
    expect(matchesFilter(txTheirs, f, 'me', 'them')).toBe(false)
    expect(matchesFilter(settleMine, f, 'me', 'them')).toBe(false)
  })
  it('multi-category union', () => {
    const f = { ...defaultFilter(), categories: new Set(['food', 'transit'] as const) }
    expect(matchesFilter(txMine, f, 'me', 'them')).toBe(true)
    expect(matchesFilter(txTheirs, f, 'me', 'them')).toBe(true)
  })
})
