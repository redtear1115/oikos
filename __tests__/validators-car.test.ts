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
})
