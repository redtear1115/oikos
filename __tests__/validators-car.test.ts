import { describe, it, expect } from 'vitest'
import { validateCarInput } from '@/lib/validators'

describe('validateCarInput', () => {
  it('happy path: trims name + uppercases plate', () => {
    const out = validateCarInput({
      name: '  我的車  ',
      plate: ' abc-1234 ',
      purchasedAt: '2024-06-01',
      purchasePrice: 800000,
    })
    expect(out).toEqual({
      name: '我的車',
      plate: 'ABC-1234',
      purchasedAt: '2024-06-01',
      purchasePrice: 800000,
      primaryUserId: null,
      fuelType: '95',
      color: null,
      year: null,
      brand: null,
      model: null,
      initialOdometer: null,
    })
  })

  it('optional fields default to null', () => {
    const out = validateCarInput({ name: '車', plate: 'A1' })
    expect(out.purchasedAt).toBeNull()
    expect(out.purchasePrice).toBeNull()
  })

  it('throws on empty name', () => {
    expect(() => validateCarInput({ name: '   ', plate: 'A1' })).toThrow(/名稱/)
  })

  it('throws on empty plate', () => {
    expect(() => validateCarInput({ name: '車', plate: '   ' })).toThrow(/車牌/)
  })

  it('throws on name > 32 chars', () => {
    expect(() => validateCarInput({ name: 'a'.repeat(33), plate: 'A1' })).toThrow(/最長/)
  })

  it('throws on plate > 16 chars', () => {
    expect(() => validateCarInput({ name: '車', plate: 'a'.repeat(17) })).toThrow(/最長/)
  })

  it('throws on negative purchasePrice', () => {
    expect(() => validateCarInput({ name: '車', plate: 'A1', purchasePrice: -1 })).toThrow(/正整數/)
  })

  it('throws on invalid purchasedAt', () => {
    expect(() => validateCarInput({ name: '車', plate: 'A1', purchasedAt: 'not-a-date' })).toThrow(/日期/)
  })

  it('throws on out-of-range day silently coerced (2024-02-30)', () => {
    expect(() => validateCarInput({ name: '車', plate: 'A1', purchasedAt: '2024-02-30' })).toThrow(/不存在/)
  })

  it('throws on out-of-range day (2024-06-31)', () => {
    expect(() => validateCarInput({ name: '車', plate: 'A1', purchasedAt: '2024-06-31' })).toThrow(/不存在/)
  })

  it('throws on US-format date string (06-01-2024)', () => {
    expect(() => validateCarInput({ name: '車', plate: 'A1', purchasedAt: '06-01-2024' })).toThrow(/格式錯誤/)
  })

  // Slice 2: primaryUserId + fuelType extension
  const validBase = { name: '車', plate: 'A1' }

  it('accepts primaryUserId (uuid string) and null', () => {
    const r1 = validateCarInput({ ...validBase, primaryUserId: 'some-user-id', fuelType: '95' })
    expect(r1.primaryUserId).toBe('some-user-id')
    const r2 = validateCarInput({ ...validBase, primaryUserId: null, fuelType: '95' })
    expect(r2.primaryUserId).toBeNull()
  })

  it('accepts all 4 fuelType values', () => {
    for (const ft of ['92', '95', '98', 'diesel'] as const) {
      const r = validateCarInput({ ...validBase, fuelType: ft })
      expect(r.fuelType).toBe(ft)
    }
  })

  it('rejects invalid fuelType', () => {
    expect(() => validateCarInput({ ...validBase, fuelType: 'foo' as never })).toThrow(/油種/)
  })

  it('defaults fuelType to "95" when undefined (existing Slice 1 callers)', () => {
    const r = validateCarInput({ ...validBase, fuelType: undefined as never })
    expect(r.fuelType).toBe('95')
  })

  // Slice 3: extended car fields (color, year, brand, model, initialOdometer)
  it('accepts all extended optional fields', () => {
    const r = validateCarInput({
      ...validBase,
      color: 'white',
      year: 2020,
      brand: 'Toyota',
      model: 'Altis',
      initialOdometer: 50000,
    })
    expect(r.color).toBe('white')
    expect(r.year).toBe(2020)
    expect(r.brand).toBe('Toyota')
    expect(r.model).toBe('Altis')
    expect(r.initialOdometer).toBe(50000)
  })

  it('defaults extended fields to null when absent', () => {
    const r = validateCarInput(validBase)
    expect(r.color).toBeNull()
    expect(r.year).toBeNull()
    expect(r.brand).toBeNull()
    expect(r.model).toBeNull()
    expect(r.initialOdometer).toBeNull()
  })

  it('rejects year below 1900 or above 2100', () => {
    expect(() => validateCarInput({ ...validBase, year: 1800 })).toThrow(/年份/)
    expect(() => validateCarInput({ ...validBase, year: 2200 })).toThrow(/年份/)
  })

  it('rejects brand longer than 32 chars', () => {
    expect(() => validateCarInput({ ...validBase, brand: 'A'.repeat(33) })).toThrow(/品牌/)
  })

  it('rejects model longer than 32 chars', () => {
    expect(() => validateCarInput({ ...validBase, model: 'A'.repeat(33) })).toThrow(/型號/)
  })

  it('rejects negative initialOdometer', () => {
    expect(() => validateCarInput({ ...validBase, initialOdometer: -1 })).toThrow(/里程/)
  })
})
