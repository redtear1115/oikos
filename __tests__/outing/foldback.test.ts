import { describe, it, expect } from 'vitest'
import { coupleNetFromOuting } from '@/lib/outing/foldback'

const expense = (paidBy: string, amount: number, shares: [string, number][]) => ({
  paidByParticipantId: paidBy,
  amount,
  shares: shares.map(([participantId, shareAmount]) => ({ participantId, shareAmount })),
})

describe('coupleNetFromOuting — main-ledger convention (>0 = B owes A)', () => {
  it('A pays, B consumes → B owes A B’s share', () => {
    const net = coupleNetFromOuting('A', 'B', [expense('A', 100, [['A', 50], ['B', 50]])], [])
    expect(net).toBe(50)
  })

  it('B pays, A consumes → negative (A owes B)', () => {
    const net = coupleNetFromOuting('A', 'B', [expense('B', 100, [['A', 50], ['B', 50]])], [])
    expect(net).toBe(-50)
  })

  it('friend shares are excluded; only the other member’s share counts', () => {
    // A pays 90, split A/B/friend 30 each → only B’s 30 folds.
    const net = coupleNetFromOuting('A', 'B', [expense('A', 90, [['A', 30], ['B', 30], ['F', 30]])], [])
    expect(net).toBe(30)
  })

  it('inter-member settlement reduces the fold (B repays A)', () => {
    const net = coupleNetFromOuting(
      'A', 'B',
      [expense('A', 100, [['A', 50], ['B', 50]])],
      [{ fromParticipantId: 'B', toParticipantId: 'A', amount: 50 }],
    )
    expect(net).toBe(0)
  })

  it('only one member participates (other has no share) → 0', () => {
    const net = coupleNetFromOuting('A', 'B', [expense('A', 80, [['A', 40], ['F', 40]])], [])
    expect(net).toBe(0)
  })

  it('solo group (a member id is null) → 0', () => {
    const net = coupleNetFromOuting('A', null, [expense('A', 100, [['A', 50], ['F', 50]])], [])
    expect(net).toBe(0)
  })
})
