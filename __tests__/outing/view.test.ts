import { describe, it, expect } from 'vitest'
import { buildOutingView } from '@/lib/outing/view'

describe('buildOutingView', () => {
  const base = {
    participants: [
      { id: 'A', displayName: '我', profileId: 'pa' },
      { id: 'B', displayName: '伴', profileId: 'pb' },
      { id: 'F', displayName: '朋友', profileId: null },
    ],
    memberAParticipantId: 'A',
    memberBParticipantId: 'B',
  }

  it('attaches each participant’s net and computes transfers', () => {
    const view = buildOutingView({
      ...base,
      expenses: [{ paidByParticipantId: 'A', amount: 90, shares: [
        { participantId: 'A', shareAmount: 30 },
        { participantId: 'B', shareAmount: 30 },
        { participantId: 'F', shareAmount: 30 },
      ] }],
      settlements: [],
    })
    const netOf = (id: string) => view.participants.find((p) => p.id === id)!.net
    expect(netOf('A')).toBe(60)
    expect(netOf('B')).toBe(-30)
    expect(netOf('F')).toBe(-30)
    // everyone repays A
    expect(view.transfers.every((t) => t.to === 'A')).toBe(true)
    expect(view.transfers.reduce((s, t) => s + t.amount, 0)).toBe(60)
  })

  it('coupleNet folds only the inter-member portion (friend excluded)', () => {
    const view = buildOutingView({
      ...base,
      expenses: [{ paidByParticipantId: 'A', amount: 90, shares: [
        { participantId: 'A', shareAmount: 30 },
        { participantId: 'B', shareAmount: 30 },
        { participantId: 'F', shareAmount: 30 },
      ] }],
      settlements: [],
    })
    expect(view.coupleNet).toBe(30) // only B's share paid by A
  })

  it('preserves participant metadata', () => {
    const view = buildOutingView({ ...base, expenses: [], settlements: [] })
    expect(view.participants.find((p) => p.id === 'F')!.profileId).toBeNull()
    expect(view.participants.find((p) => p.id === 'A')!.displayName).toBe('我')
  })
})
