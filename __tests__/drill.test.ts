import { describe, it, expect } from 'vitest'
import {
  applyDrillToParams,
  drillAppliesToTab,
  drillKey,
  fromDrillWire,
  parseDrillFromRecord,
  parseDrillFromSearchParams,
  toDrillWire,
  DRILL_ASSET_NONE,
  type DrillFilter,
} from '@/lib/drill'

describe('parseDrillFromRecord', () => {
  it('parses an expense category drill', () => {
    expect(parseDrillFromRecord({ drillCategory: 'dining' })).toEqual({
      kind: 'category',
      categoryId: 'dining',
    })
  })

  it('rejects "settle" — not a user-pickable category', () => {
    expect(parseDrillFromRecord({ drillCategory: 'settle' })).toBeNull()
  })

  it('rejects unknown category ids', () => {
    expect(parseDrillFromRecord({ drillCategory: 'nope' })).toBeNull()
  })

  it('parses an income category drill', () => {
    expect(parseDrillFromRecord({ drillIncomeCategory: 'salary' })).toEqual({
      kind: 'income',
      categoryId: 'salary',
    })
  })

  it('parses an asset drill (uuid string)', () => {
    expect(
      parseDrillFromRecord({ drillAsset: '11111111-1111-1111-1111-111111111111' }),
    ).toEqual({ kind: 'asset', assetId: '11111111-1111-1111-1111-111111111111' })
  })

  it('parses the no-asset sentinel', () => {
    expect(parseDrillFromRecord({ drillAsset: DRILL_ASSET_NONE })).toEqual({
      kind: 'asset',
      assetId: null,
    })
  })

  it('treats empty asset string as no drill', () => {
    expect(parseDrillFromRecord({ drillAsset: '' })).toBeNull()
  })

  it('rejects non-uuid asset strings (tampered URL)', () => {
    expect(parseDrillFromRecord({ drillAsset: 'not-a-uuid' })).toBeNull()
    expect(parseDrillFromRecord({ drillAsset: "'; DROP TABLE--" })).toBeNull()
  })

  it('returns null when nothing is set', () => {
    expect(parseDrillFromRecord({})).toBeNull()
  })

  it('prioritises category > asset > income when more than one is set', () => {
    expect(
      parseDrillFromRecord({
        drillCategory: 'dining',
        drillAsset: 'abc',
        drillIncomeCategory: 'salary',
      }),
    ).toEqual({ kind: 'category', categoryId: 'dining' })
  })
})

describe('parseDrillFromSearchParams', () => {
  it('reads from URLSearchParams', () => {
    const p = new URLSearchParams('drillCategory=transit&month=2026-05')
    expect(parseDrillFromSearchParams(p)).toEqual({
      kind: 'category',
      categoryId: 'transit',
    })
  })
})

describe('toDrillWire / fromDrillWire', () => {
  const round = (d: DrillFilter) => fromDrillWire(toDrillWire(d))

  it('round-trips a category drill', () => {
    const d: DrillFilter = { kind: 'category', categoryId: 'dining' }
    expect(round(d)).toEqual(d)
  })

  it('round-trips an asset drill', () => {
    const d: DrillFilter = { kind: 'asset', assetId: 'abc-123' }
    expect(round(d)).toEqual(d)
  })

  it('round-trips a no-asset drill', () => {
    const d: DrillFilter = { kind: 'asset', assetId: null }
    expect(round(d)).toEqual(d)
  })

  it('round-trips an income drill', () => {
    const d: DrillFilter = { kind: 'income', categoryId: 'salary' }
    expect(round(d)).toEqual(d)
  })
})

describe('applyDrillToParams', () => {
  it('sets the category param + clears the others', () => {
    const p = new URLSearchParams('drillAsset=abc&drillIncomeCategory=salary')
    applyDrillToParams(p, { kind: 'category', categoryId: 'dining' })
    expect(p.get('drillCategory')).toBe('dining')
    expect(p.get('drillAsset')).toBeNull()
    expect(p.get('drillIncomeCategory')).toBeNull()
  })

  it('clears all params when given null', () => {
    const p = new URLSearchParams('drillCategory=dining&drillAsset=abc')
    applyDrillToParams(p, null)
    expect(p.get('drillCategory')).toBeNull()
    expect(p.get('drillAsset')).toBeNull()
    expect(p.get('drillIncomeCategory')).toBeNull()
  })

  it('encodes null assetId as the sentinel, not empty', () => {
    const p = new URLSearchParams()
    applyDrillToParams(p, { kind: 'asset', assetId: null })
    expect(p.get('drillAsset')).toBe(DRILL_ASSET_NONE)
  })
})

describe('drillKey', () => {
  it('returns empty for null', () => {
    expect(drillKey(null)).toBe('')
  })

  it('returns kind:id for set drills', () => {
    expect(drillKey({ kind: 'category', categoryId: 'dining' })).toBe('cat:dining')
    expect(drillKey({ kind: 'asset', assetId: 'abc' })).toBe('asset:abc')
    expect(drillKey({ kind: 'asset', assetId: null })).toBe(`asset:${DRILL_ASSET_NONE}`)
    expect(drillKey({ kind: 'income', categoryId: 'salary' })).toBe('income:salary')
  })
})

describe('drillAppliesToTab', () => {
  const cat: DrillFilter = { kind: 'category', categoryId: 'dining' }
  const asset: DrillFilter = { kind: 'asset', assetId: null }
  const income: DrillFilter = { kind: 'income', categoryId: 'salary' }

  it('any drill applies to the all tab', () => {
    expect(drillAppliesToTab(cat, 'all')).toBe(true)
    expect(drillAppliesToTab(asset, 'all')).toBe(true)
    expect(drillAppliesToTab(income, 'all')).toBe(true)
  })

  it('expense tab accepts category and asset, not income', () => {
    expect(drillAppliesToTab(cat, 'expense')).toBe(true)
    expect(drillAppliesToTab(asset, 'expense')).toBe(true)
    expect(drillAppliesToTab(income, 'expense')).toBe(false)
  })

  it('income tab accepts only income', () => {
    expect(drillAppliesToTab(cat, 'income')).toBe(false)
    expect(drillAppliesToTab(asset, 'income')).toBe(false)
    expect(drillAppliesToTab(income, 'income')).toBe(true)
  })

  it('null drill never applies', () => {
    expect(drillAppliesToTab(null, 'all')).toBe(false)
    expect(drillAppliesToTab(null, 'expense')).toBe(false)
    expect(drillAppliesToTab(null, 'income')).toBe(false)
  })
})
