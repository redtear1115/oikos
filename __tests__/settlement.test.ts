import { describe, it, expect } from 'vitest'
import { settlementChips } from '@/lib/settlement'

describe('settlementChips', () => {
  it('returns 3 chips for normal debt', () => {
    const chips = settlementChips(461)
    expect(chips).toHaveLength(3)
    expect(chips[0]).toEqual({ label: '全額', value: 461 })
    expect(chips[1]).toEqual({ label: '一半', value: 231 })
    expect(chips[2]).toEqual({ label: '整數', value: 400 })
  })

  it('hides 整數 chip when debt < 100', () => {
    const chips = settlementChips(75)
    expect(chips).toHaveLength(2)
    expect(chips.map(c => c.label)).toEqual(['全額', '一半'])
  })

  it('hides 整數 chip when it equals 全額', () => {
    const chips = settlementChips(200)
    expect(chips.map(c => c.label)).toEqual(['全額', '一半'])
  })

  it('整數 rounds down when up would exceed debt', () => {
    expect(settlementChips(150)[2]).toEqual({ label: '整數', value: 100 })
  })

  it('一半 uses ceil for odd', () => {
    expect(settlementChips(101)[1]).toEqual({ label: '一半', value: 51 })
  })

  it('returns empty array when debt is 0', () => {
    expect(settlementChips(0)).toEqual([])
  })

  it('rejects negative input by treating as 0', () => {
    expect(settlementChips(-100)).toEqual([])
  })
})
