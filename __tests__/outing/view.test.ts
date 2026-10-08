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

  it('coupleNet is the member<->member suggested line (friend excluded)', () => {
    const view = buildOutingView({
      ...base,
      expenses: [{ paidByParticipantId: 'A', amount: 90, shares: [
        { participantId: 'A', shareAmount: 30 },
        { participantId: 'B', shareAmount: 30 },
        { participantId: 'F', shareAmount: 30 },
      ] }],
      settlements: [],
    })
    expect(view.coupleNet).toBe(30) // the B→A line of the suggestions
  })

  it('coupleNet equals the listed A↔B transfer, and 0 when friends absorb the debt', () => {
    // A pays 100 for A/F: no B involved, B owes nothing even though the view lists transfers.
    const none = buildOutingView({
      ...base,
      expenses: [{ paidByParticipantId: 'A', amount: 100, shares: [
        { participantId: 'A', shareAmount: 50 },
        { participantId: 'F', shareAmount: 50 },
      ] }],
      settlements: [],
    })
    expect(none.coupleNet).toBe(0)

    // B pays 90 for A/B/F: A→B 30 and F→B 30, the fold is the A→B line, negative.
    const neg = buildOutingView({
      ...base,
      expenses: [{ paidByParticipantId: 'B', amount: 90, shares: [
        { participantId: 'A', shareAmount: 30 },
        { participantId: 'B', shareAmount: 30 },
        { participantId: 'F', shareAmount: 30 },
      ] }],
      settlements: [],
    })
    expect(neg.transfers).toContainEqual({ from: 'A', to: 'B', amount: 30 })
    expect(neg.coupleNet).toBe(-30)
  })

  it('a solo group (member B null) never folds', () => {
    const view = buildOutingView({
      ...base,
      memberBParticipantId: null,
      expenses: [{ paidByParticipantId: 'A', amount: 90, shares: [
        { participantId: 'A', shareAmount: 30 },
        { participantId: 'F', shareAmount: 60 },
      ] }],
      settlements: [],
    })
    expect(view.coupleNet).toBe(0)
  })

  it('preserves participant metadata', () => {
    const view = buildOutingView({ ...base, expenses: [], settlements: [] })
    expect(view.participants.find((p) => p.id === 'F')!.profileId).toBeNull()
    expect(view.participants.find((p) => p.id === 'A')!.displayName).toBe('我')
  })

  describe('foldedLine (#1635) — an ended outing stops listing the line it already folded', () => {
    // A 8000, F2 1800, F1 1200 paid, split four ways (3,000 each) with a second friend:
    // the suggestions include the member line plus friends' lines.
    const parts = [...base.participants, { id: 'G', displayName: '阿美', profileId: null }]
    const all = ['A', 'B', 'F', 'G']
    const expenses = [
      { paidByParticipantId: 'A', amount: 8000, shares: all.map((id) => ({ participantId: id, shareAmount: 2750 })) },
      { paidByParticipantId: 'F', amount: 3200, shares: all.map((id) => ({ participantId: id, shareAmount: 800 })) },
      { paidByParticipantId: 'G', amount: 1200, shares: all.map((id) => ({ participantId: id, shareAmount: 300 })) },
    ]
    const input = { ...base, participants: parts, expenses, settlements: [] }
    const isMemberLine = (t: { from: string; to: string }) => [t.from, t.to].every((id) => id === 'A' || id === 'B')

    it('drops the matching transfer and leaves the others and coupleNet untouched', () => {
      const plain = buildOutingView(input)
      const line = plain.transfers.find(isMemberLine)!
      expect(line).toBeDefined()
      const view = buildOutingView({ ...input, foldedLine: { from: line.from, to: line.to } })
      expect(view.transfers.find(isMemberLine)).toBeUndefined()
      expect(view.transfers).toEqual(plain.transfers.filter((t) => !isMemberLine(t)))
      expect(view.transfers.length).toBe(plain.transfers.length - 1)
      expect(view.coupleNet).toBe(plain.coupleNet)
      expect(view.participants).toEqual(plain.participants)
    })

    it('drops the line when the stored direction is the reverse of the recomputed one', () => {
      const plain = buildOutingView(input)
      const line = plain.transfers.find(isMemberLine)!
      const view = buildOutingView({ ...input, foldedLine: { from: line.to, to: line.from } })
      expect(view.transfers.find(isMemberLine)).toBeUndefined()
      expect(view.transfers.length).toBe(plain.transfers.length - 1)
    })

    it('null or absent leaves the list unchanged; a line matching nothing removes nothing', () => {
      const plain = buildOutingView(input)
      expect(buildOutingView({ ...input, foldedLine: null }).transfers).toEqual(plain.transfers)
      expect(buildOutingView({ ...input, foldedLine: { from: 'X', to: 'Y' } }).transfers).toEqual(plain.transfers)
    })
  })
})
