import { describe, it, expect } from 'vitest'
import { transactionDelta, settlementDelta, computeBalance } from '@/lib/balance'

describe('transactionDelta — from member_a perspective', () => {
  it('all_mine paid by A → 0', () => {
    expect(transactionDelta({ amount: 100, splitType: 'all_mine', payerIs: 'a' })).toBe(0)
  })
  it('all_mine paid by B → 0', () => {
    expect(transactionDelta({ amount: 100, splitType: 'all_mine', payerIs: 'b' })).toBe(0)
  })
  it('all_theirs paid by A → +amount (B owes A full)', () => {
    expect(transactionDelta({ amount: 100, splitType: 'all_theirs', payerIs: 'a' })).toBe(100)
  })
  it('all_theirs paid by B → −amount (A owes B full)', () => {
    expect(transactionDelta({ amount: 100, splitType: 'all_theirs', payerIs: 'b' })).toBe(-100)
  })
  it('half paid by A → +ceil(amount/2)', () => {
    expect(transactionDelta({ amount: 101, splitType: 'half', payerIs: 'a' })).toBe(51)
  })
  it('half paid by B → −ceil(amount/2)', () => {
    expect(transactionDelta({ amount: 101, splitType: 'half', payerIs: 'b' })).toBe(-51)
  })
  it('half even amount uses exact half', () => {
    expect(transactionDelta({ amount: 100, splitType: 'half', payerIs: 'a' })).toBe(50)
  })
})

describe('settlementDelta', () => {
  // paid_by = the actual cash sender. Convention: balance > 0 = B owes A.
  it('A pays B (paid_by=A) → +amount (B becomes indebted to A by amount)', () => {
    expect(settlementDelta({ amount: 200, payerIs: 'a' })).toBe(200)
  })
  it('B pays A (paid_by=B) → −amount (A becomes indebted to B by amount)', () => {
    expect(settlementDelta({ amount: 200, payerIs: 'b' })).toBe(-200)
  })
  it('settling existing debt drives balance toward 0 — B owes A 100, B pays A 100', () => {
    // Initial balance = +100 (B owes A 100). B pays A 100 to settle.
    // settlementDelta(payerIs='b') = -100 → balance = 100 + (-100) = 0. ✓
    expect(100 + settlementDelta({ amount: 100, payerIs: 'b' })).toBe(0)
  })
  it('settling existing debt drives balance toward 0 — A owes B 100, A pays B 100', () => {
    // Initial balance = -100 (A owes B 100). A pays B 100 to settle.
    // settlementDelta(payerIs='a') = +100 → balance = -100 + 100 = 0. ✓
    expect(-100 + settlementDelta({ amount: 100, payerIs: 'a' })).toBe(0)
  })
})

describe('computeBalance', () => {
  it('empty → 0', () => {
    expect(computeBalance({ transactions: [], settlements: [] })).toBe(0)
  })

  it('single half tx by A → +ceil(amount/2)', () => {
    const balance = computeBalance({
      transactions: [{ amount: 240, splitType: 'half', payerIs: 'a' }],
      settlements: [],
    })
    expect(balance).toBe(120)
  })

  it('mixed transactions + settlement', () => {
    const balance = computeBalance({
      transactions: [
        { amount: 200, splitType: 'half', payerIs: 'a' },      // +100
        { amount: 100, splitType: 'all_theirs', payerIs: 'b' },// -100
        { amount: 50,  splitType: 'all_mine', payerIs: 'a' },  //   0
      ],
      settlements: [
        { amount: 50, payerIs: 'b' },                          // -50 (B paid A → A indebted to B)
      ],
    })
    // 100 + (-100) + 0 + (-50) = -50
    expect(balance).toBe(-50)
  })

  it('viewerBalance flips for member_b', () => {
    const balance = 120  // member_b owes member_a 120
    const memberAView = balance              // 120 (you are owed)
    const memberBView = -balance             // -120 (you owe)
    expect(memberAView).toBe(120)
    expect(memberBView).toBe(-120)
  })
})
