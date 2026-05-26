import { describe, it, expect } from 'vitest'
import { toViewerShare, toMemberAShare } from '@/lib/splitRatio'

describe('splitRatio — viewer ↔ memberA conversion', () => {
  it('returns the value unchanged when viewer is member A', () => {
    expect(toViewerShare(90, true)).toBe(90)
    expect(toMemberAShare(90, true)).toBe(90)
  })

  it('inverts the value when viewer is member B', () => {
    // Form: viewer (B) typed "me 90%" → stored as A's % must be 10
    expect(toMemberAShare(90, false)).toBe(10)
    // DB stored A's % = 90 → viewer (B) should see "me 10%"
    expect(toViewerShare(90, false)).toBe(10)
  })

  it('is an involution — round-trip through both functions returns the input', () => {
    for (const v of [1, 10, 33, 50, 67, 90, 99]) {
      expect(toViewerShare(toMemberAShare(v, false), false)).toBe(v)
      expect(toMemberAShare(toViewerShare(v, false), false)).toBe(v)
      expect(toViewerShare(toMemberAShare(v, true), true)).toBe(v)
    }
  })

  it('demonstrates the production bug it fixes: B viewing record A created with A=90%', () => {
    // DB has paid_by=A, split_ratio_a=90 (A intended me=90%, correctly stored)
    // True split: A=90%, B=10%. A paid amount=1350. B owes A 10% × 1350 = 135.
    //
    // Pre-fix: form reads DB raw (90), labels show "我 90%" to viewer B —
    //          conveying that B took 90% (wrong: B took 10%).
    // Fix:     toViewerShare flips for viewer B → form state = 10,
    //          labels show "我 10% / 對方 90%" matching the truth.
    expect(toViewerShare(90, false)).toBe(10)
  })

  it('demonstrates the symmetric save bug: B inputs "me 90%" — must store A=10', () => {
    // Pre-fix: form sent splitRatioA=90 raw → DB stored split_ratio_a=90,
    //          schema-semantic A=90% but B intended me(B)=90%. Balance calc
    //          reads the stored value as A's % and produces the wrong delta.
    // Fix:     toMemberAShare flips for viewer B → wire value = 10 (A=10%),
    //          balance calc reads it correctly.
    expect(toMemberAShare(90, false)).toBe(10)
  })
})
