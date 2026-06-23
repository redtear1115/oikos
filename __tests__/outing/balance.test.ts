import { describe, it, expect } from 'vitest'
import { computeOutingNets } from '@/lib/outing/balance'

describe('computeOutingNets — creditor-positive', () => {
  it('one expense: payer is owed others’ shares', () => {
    const nets = computeOutingNets(
      ['a', 'b'],
      [{ paidByParticipantId: 'a', amount: 100, shares: [
        { participantId: 'a', shareAmount: 50 },
        { participantId: 'b', shareAmount: 50 },
      ] }],
      [],
    )
    expect(nets.get('a')).toBe(50)
    expect(nets.get('b')).toBe(-50)
  })

  it('settlement: sending raises own net, receiving lowers it', () => {
    // a paid → a is +50 creditor, b is −50 debtor. b repays 50 to a → both 0.
    const nets = computeOutingNets(
      ['a', 'b'],
      [{ paidByParticipantId: 'a', amount: 100, shares: [
        { participantId: 'a', shareAmount: 50 },
        { participantId: 'b', shareAmount: 50 },
      ] }],
      [{ fromParticipantId: 'b', toParticipantId: 'a', amount: 50 }],
    )
    expect(nets.get('a')).toBe(0)
    expect(nets.get('b')).toBe(0)
  })

  it('every participant id is present, default 0', () => {
    const nets = computeOutingNets(['a', 'b', 'c'], [], [])
    expect(nets.get('c')).toBe(0)
  })

  it('invariant: all nets sum to 0', () => {
    const nets = computeOutingNets(
      ['a', 'b', 'c'],
      [{ paidByParticipantId: 'a', amount: 90, shares: [
        { participantId: 'a', shareAmount: 30 },
        { participantId: 'b', shareAmount: 30 },
        { participantId: 'c', shareAmount: 30 },
      ] }],
      [{ fromParticipantId: 'b', toParticipantId: 'a', amount: 10 }],
    )
    const sum = [...nets.values()].reduce((s, v) => s + v, 0)
    expect(sum).toBe(0)
  })
})
