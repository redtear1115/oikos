import { describe, it, expect } from 'vitest'
import { splitEqual } from '@/lib/outing/split'

describe('splitEqual', () => {
  it('divides evenly when divisible', () => {
    expect(splitEqual(300, ['a', 'b', 'c'])).toEqual([
      { participantId: 'a', shareAmount: 100 },
      { participantId: 'b', shareAmount: 100 },
      { participantId: 'c', shareAmount: 100 },
    ])
  })

  it('gives remainder cents to lowest ids first, deterministically', () => {
    // 100 / 3 = 33 r1 → lowest id gets the extra cent
    expect(splitEqual(100, ['c', 'a', 'b'])).toEqual([
      { participantId: 'a', shareAmount: 34 },
      { participantId: 'b', shareAmount: 33 },
      { participantId: 'c', shareAmount: 33 },
    ])
  })

  it('input order does not affect output (sorted by id)', () => {
    expect(splitEqual(101, ['b', 'a'])).toEqual([
      { participantId: 'a', shareAmount: 51 },
      { participantId: 'b', shareAmount: 50 },
    ])
  })

  it('invariant: shares sum to amount', () => {
    for (const amount of [0, 1, 7, 100, 101, 99999]) {
      const shares = splitEqual(amount, ['p1', 'p2', 'p3', 'p4'])
      expect(shares.reduce((s, x) => s + x.shareAmount, 0)).toBe(amount)
    }
  })

  it('throws on empty participants', () => {
    expect(() => splitEqual(100, [])).toThrow()
  })
})
