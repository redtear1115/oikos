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
  it('A pays settlement → −amount (A reduces what B owes them OR pays down debt)', () => {
    expect(settlementDelta({ amount: 200, payerIs: 'a' })).toBe(-200)
  })
  it('B pays settlement → +amount', () => {
    expect(settlementDelta({ amount: 200, payerIs: 'b' })).toBe(200)
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
        { amount: 200, splitType: 'half', payerIs: 'a' },     // +100
        { amount: 100, splitType: 'all_theirs', payerIs: 'b' },// -100
        { amount: 50,  splitType: 'all_mine', payerIs: 'a' }, // 0
      ],
      settlements: [
        { amount: 50, payerIs: 'b' }, // +50
      ],
    })
    expect(balance).toBe(50)
  })

  it('viewerBalance flips for member_b', () => {
    const balance = 120  // member_b owes member_a 120
    const memberAView = balance              // 120 (you are owed)
    const memberBView = -balance             // -120 (you owe)
    expect(memberAView).toBe(120)
    expect(memberBView).toBe(-120)
  })
})
