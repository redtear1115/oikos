import { describe, it, expect } from 'vitest'
import {
  coupleNetFromOuting,
  coupleNetFromTransfers,
  foldNetFromRows,
  foldPreviewFor,
  memberPidsOf,
} from '@/lib/outing/foldback'
import { computeOutingNets } from '@/lib/outing/balance'
import { minimalTransfers } from '@/lib/outing/settle'
import { splitEqual } from '@/lib/outing/split'
import { buildOutingView } from '@/lib/outing/view'

const expense = (paidBy: string, amount: number, shares: [string, number][]) => ({
  paidByParticipantId: paidBy,
  amount,
  shares: shares.map(([participantId, shareAmount]) => ({ participantId, shareAmount })),
})
const equalExpense = (paidBy: string, amount: number, ids: string[]) =>
  expense(paidBy, amount, splitEqual(amount, ids).map((s) => [s.participantId, s.shareAmount] as [string, number]))
const fold = (ids: string[], a: string | null, b: string | null, ex: ReturnType<typeof expense>[], st: { fromParticipantId: string; toParticipantId: string; amount: number }[] = []) =>
  coupleNetFromOuting(ids, a, b, ex, st)

describe('coupleNetFromOuting — the member<->member suggested line (main-ledger: >0 = B owes A)', () => {
  it('A pays, B consumes → B owes A B’s share', () => {
    expect(fold(['A', 'B'], 'A', 'B', [expense('A', 100, [['A', 50], ['B', 50]])])).toBe(50)
  })

  it('B pays, A consumes → negative (A owes B)', () => {
    expect(fold(['A', 'B'], 'A', 'B', [expense('B', 100, [['A', 50], ['B', 50]])])).toBe(-50)
  })

  it('friend shares are excluded; the friend’s line never folds', () => {
    // A pays 90, split A/B/friend 30 each → B→A 30 and F→A 30; only B’s 30 folds.
    expect(fold(['A', 'B', 'F'], 'A', 'B', [expense('A', 90, [['A', 30], ['B', 30], ['F', 30]])])).toBe(30)
  })

  it('inter-member settlement inside the outing is in the nets, so it is never folded twice', () => {
    const ex = [expense('A', 100, [['A', 50], ['B', 50]])]
    const st = [{ fromParticipantId: 'B', toParticipantId: 'A', amount: 50 }]
    expect(fold(['A', 'B'], 'A', 'B', ex, st)).toBe(0)
  })

  it('only one member participates (other has no share) → 0', () => {
    expect(fold(['A', 'B', 'F'], 'A', 'B', [expense('A', 80, [['A', 40], ['F', 40]])])).toBe(0)
  })

  it('solo group (a member id is null) → 0, even when a friend owes A', () => {
    expect(fold(['A', 'F'], 'A', null, [expense('A', 100, [['A', 50], ['F', 50]])])).toBe(0)
    expect(fold(['A', 'F'], null, 'A', [expense('A', 100, [['A', 50], ['F', 50]])])).toBe(0)
  })

  it('members passed in the other order flip the sign', () => {
    const ex = [expense('A', 100, [['A', 50], ['B', 50]])]
    expect(fold(['A', 'B'], 'B', 'A', ex)).toBe(-50)
  })

  it('regression #1634: A 8000 / B 4000 / F1 800 paid, split 4 ways — fold 0, still 0 after the friends pay as suggested', () => {
    const ids = ['A', 'B', 'F1', 'F2']
    const ex = [equalExpense('A', 8000, ids), equalExpense('B', 4000, ids), equalExpense('F1', 800, ids)]
    expect(fold(ids, 'A', 'B', ex)).toBe(0)

    const paid = [
      { fromParticipantId: 'F2', toParticipantId: 'A', amount: 3200 },
      { fromParticipantId: 'F1', toParticipantId: 'A', amount: 1600 },
      { fromParticipantId: 'F1', toParticipantId: 'B', amount: 800 },
    ]
    expect(fold(ids, 'A', 'B', ex, paid)).toBe(0)
    // out of pocket = paid + sent − received; everyone ends at their 3200 share
    const oop = (id: string) =>
      ex.filter((e) => e.paidByParticipantId === id).reduce((n, e) => n + e.amount, 0) +
      paid.filter((s) => s.fromParticipantId === id).reduce((n, s) => n + s.amount, 0) -
      paid.filter((s) => s.toParticipantId === id).reduce((n, s) => n + s.amount, 0)
    for (const id of ids) expect(oop(id)).toBe(3200)
  })

  it('second example: A 8000 / F2 1800 / F1 1200 paid, split 4 ways — fold is the +2750 B→A line', () => {
    const ids = ['A', 'B', 'F1', 'F2']
    const ex = [equalExpense('A', 8000, ids), equalExpense('F2', 1800, ids), equalExpense('F1', 1200, ids)]
    const transfers = minimalTransfers(computeOutingNets(ids, ex, []))
    expect(transfers).toContainEqual({ from: 'B', to: 'A', amount: 2750 })
    expect(fold(ids, 'A', 'B', ex)).toBe(2750)
  })
})

describe('memberPidsOf', () => {
  const ps = [
    { id: 'pA', profileId: 'ua' },
    { id: 'pB', profileId: 'ub' },
    { id: 'pF', profileId: null },
  ]
  it('resolves by group-row profile ids', () => {
    expect(memberPidsOf(ps, 'ua', 'ub')).toEqual({ a: 'pA', b: 'pB' })
    expect(memberPidsOf(ps, 'ub', 'ua')).toEqual({ a: 'pB', b: 'pA' })
  })
  it('a null member resolves to null, never to an unbound friend (solo group)', () => {
    expect(memberPidsOf(ps, 'ua', null)).toEqual({ a: 'pA', b: null })
    expect(memberPidsOf(ps, null, 'ub')).toEqual({ a: null, b: 'pB' })
  })
  it('a member with no participant (deleted account) resolves to null', () => {
    expect(memberPidsOf(ps, 'ua', 'gone')).toEqual({ a: 'pA', b: null })
  })
})

describe('foldPreviewFor — only an active outing in the current chapter folds', () => {
  it('previews the fold for active + current epoch', () => {
    expect(foldPreviewFor({ status: 'active', epochId: 'e1' }, 'e1', 300)).toBe(300)
    expect(foldPreviewFor({ status: 'active', epochId: 'e1' }, 'e1', -300)).toBe(-300)
  })
  it('previews 0 for an ended outing, a closed chapter, or no open epoch', () => {
    expect(foldPreviewFor({ status: 'ended', epochId: 'e1' }, 'e1', 300)).toBe(0)
    expect(foldPreviewFor({ status: 'active', epochId: 'e1' }, 'e2', 300)).toBe(0)
    expect(foldPreviewFor({ status: 'active', epochId: 'e1' }, null, 300)).toBe(0)
    expect(foldPreviewFor({ status: 'active', epochId: null }, null, 300)).toBe(0)
  })
})

describe('coupleNetFromTransfers', () => {
  it('sums the single A↔B line with sign; ignores friends', () => {
    expect(coupleNetFromTransfers([{ from: 'B', to: 'A', amount: 5 }, { from: 'F', to: 'A', amount: 9 }], 'A', 'B')).toBe(5)
    expect(coupleNetFromTransfers([{ from: 'A', to: 'B', amount: 5 }], 'A', 'B')).toBe(-5)
    expect(coupleNetFromTransfers([{ from: 'A', to: 'B', amount: 5 }], 'A', null)).toBe(0)
  })
})

// Seeded property test: random outings, 250 of them.
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('property: the fold is exactly the A↔B suggestion line (250 seeded outings)', () => {
  it('holds for random participants, expenses, share subsets and pre-recorded settlements', () => {
    const rnd = mulberry32(1634)
    const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1))
    let nonZeroFolds = 0

    for (let run = 0; run < 250; run++) {
      const n = int(2, 8)
      const ids = Array.from({ length: n }, (_, i) => `p${i}`)
      // A and B are random distinct participants, so orientation is exercised both ways.
      const aIdx = int(0, n - 1)
      let bIdx = int(0, n - 2)
      if (bIdx >= aIdx) bIdx++
      const A = ids[aIdx]
      const B = ids[bIdx]
      const participants = ids.map((id) => ({
        id,
        displayName: id,
        profileId: id === A ? 'ua' : id === B ? 'ub' : rnd() < 0.5 ? null : `f-${id}`,
      }))

      const exps = Array.from({ length: int(0, 6) }, () => {
        const sharers = ids.filter(() => rnd() < 0.6)
        if (sharers.length === 0) sharers.push(ids[int(0, n - 1)])
        return equalExpense(ids[int(0, n - 1)], int(1, 5000), sharers)
      })
      const sets = Array.from({ length: rnd() < 0.5 ? 0 : int(1, 3) }, () => {
        const from = ids[int(0, n - 1)]
        let to = ids[int(0, n - 1)]
        if (to === from) to = ids[(ids.indexOf(from) + 1) % n]
        return { fromParticipantId: from, toParticipantId: to, amount: int(1, 3000) }
      })

      const nets = computeOutingNets(ids, exps, sets)
      const transfers = minimalTransfers(nets)

      // at most one A↔B line, in either direction
      const between = transfers.filter((t) => (t.from === A && t.to === B) || (t.from === B && t.to === A))
      expect(between.length).toBeLessThanOrEqual(1)

      const view = buildOutingView({ participants, expenses: exps, settlements: sets, memberAParticipantId: A, memberBParticipantId: B })

      // the end action's input assembly, from DB-shaped rows, agrees with the view
      const expenseRows = exps.map((e, i) => ({ id: `e${i}`, paidBy: e.paidByParticipantId, amount: e.amount }))
      const shareRows = exps.flatMap((e, i) => e.shares.map((s) => ({ expenseId: `e${i}`, ...s })))
      const endNet = foldNetFromRows({
        participants: participants.map((p) => ({ id: p.id, profileId: p.profileId })),
        memberA: 'ua',
        memberB: 'ub',
        expenseRows,
        shareRows,
        settlementRows: sets,
      })
      expect(endNet).toBe(view.coupleNet)

      // fold is the signed line
      const expected = between.length === 0 ? 0 : between[0].from === B ? between[0].amount : -between[0].amount
      expect(view.coupleNet).toBe(expected)
      if (expected !== 0) nonZeroFolds++

      // all non-A↔B transfers paid + the fold applied → everyone's out of pocket equals their share
      const paid = [
        ...sets,
        ...transfers
          .filter((t) => !between.includes(t))
          .map((t) => ({ fromParticipantId: t.from, toParticipantId: t.to, amount: t.amount })),
        ...(view.coupleNet > 0
          ? [{ fromParticipantId: B, toParticipantId: A, amount: view.coupleNet }]
          : view.coupleNet < 0
            ? [{ fromParticipantId: A, toParticipantId: B, amount: -view.coupleNet }]
            : []),
      ]
      for (const id of ids) {
        const oop =
          exps.filter((e) => e.paidByParticipantId === id).reduce((s, e) => s + e.amount, 0) +
          paid.filter((s) => s.fromParticipantId === id).reduce((s, x) => s + x.amount, 0) -
          paid.filter((s) => s.toParticipantId === id).reduce((s, x) => s + x.amount, 0)
        const share = exps.reduce((s, e) => s + (e.shares.find((x) => x.participantId === id)?.shareAmount ?? 0), 0)
        expect(oop).toBe(share)
      }
    }
    // the generator must actually exercise the fold, not just zeros
    expect(nonZeroFolds).toBeGreaterThan(20)
  })

  it('a null member pid makes both the view and the end assembly 0', () => {
    const ex = [equalExpense('p0', 900, ['p0', 'p1', 'p2'])]
    const participants = [
      { id: 'p0', displayName: 'a', profileId: 'ua' },
      { id: 'p1', displayName: 'f', profileId: null },
      { id: 'p2', displayName: 'g', profileId: null },
    ]
    // solo: group.memberB is null; the page resolves via memberPidsOf, never to a friend
    const { a, b } = memberPidsOf(participants, 'ua', null)
    expect(b).toBeNull()
    expect(buildOutingView({ participants, expenses: ex, settlements: [], memberAParticipantId: a, memberBParticipantId: b }).coupleNet).toBe(0)
  })
})
