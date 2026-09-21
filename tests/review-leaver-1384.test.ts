// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactElement } from 'react'

// #1384 — a partner who left can open their own old chapter's reviews
// (read-only), with that chapter's two people; access does not widen.
//
//   chapter 1  A + B   2026-03-01 → 2026-06-15 (Taipei), epoch e1 — B left
//   chapter 2  A + C   2026-06-15 → open,                epoch e2
//   group row today: member_a A, member_b C

const TPE = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d) - 8 * 60 * 60 * 1000)
const CH1 = { startedAt: TPE(2026, 3, 1), endedAt: TPE(2026, 6, 15), epochId: 'e1', isPast: true }
const CH2 = { startedAt: TPE(2026, 6, 15), endedAt: null, epochId: 'e2', isPast: false }
const GROUP = { id: 'g1', memberA: 'user-a', memberB: 'user-c' }
const EPOCH_MEMBERS: Record<string, { memberAId: string; memberBId: string | null }> = {
  e1: { memberAId: 'user-a', memberBId: 'user-b' },
  e2: { memberAId: 'user-a', memberBId: 'user-c' },
}
const PROFILES = [
  { id: 'user-a', displayName: 'A', avatarUrl: null },
  { id: 'user-b', displayName: 'B', avatarUrl: null },
  { id: 'user-c', displayName: 'C', avatarUrl: null },
  { id: 'user-x', displayName: 'X', avatarUrl: null },
]

let viewer = 'user-b'
let window: typeof CH1 | typeof CH2 = CH1
let requestedIds: string[] = []
const quizLoader = vi.fn(async () => ({ id: 'q-live', questionKeys: [], revealedAt: null }))

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (to: string) => { throw new Error(`NEXT_REDIRECT ${to}`) },
}))
vi.mock('@/lib/supabase/server', () => ({ getCurrentUser: async () => ({ id: viewer }) }))
vi.mock('@/lib/db/queries/epoch', () => ({
  getEpochMembers: async (id: string) => EPOCH_MEMBERS[id] ?? null,
  resolveViewerEpochContext: async () => ({ group: GROUP, window }),
}))
// Profiles query: capture the requested ids and return only those rows.
vi.mock('drizzle-orm', async (orig) => ({
  ...(await orig<typeof import('drizzle-orm')>()),
  inArray: (_col: unknown, ids: string[]) => { requestedIds = ids; return ids },
}))
vi.mock('@/lib/db/client', () => ({
  db: { select: () => ({ from: () => ({ where: async () => PROFILES.filter((p) => requestedIds.includes(p.id)) }) }) },
}))
vi.mock('@/lib/db/queries/monthlyReview', () => ({
  loadMonthlyReviewSnapshot: async () => ({ computedAt: new Date() }),
  // Group-scoped rows: B's and A's from chapter 1, plus a C row that must not show in chapter 1.
  loadMonthlyReviewMessages: async () => [
    { id: 'm-a', memberId: 'user-a', body: 'from A', lockedAt: new Date() },
    { id: 'm-b', memberId: 'user-b', body: 'from B', lockedAt: new Date() },
    { id: 'm-c', memberId: 'user-c', body: 'from C', lockedAt: new Date() },
  ],
}))
vi.mock('@/lib/db/queries/partnerQuiz', () => ({
  loadPartnerQuizSessionByGroup: quizLoader,
  loadPartnerQuizAnswers: async () => [],
}))
vi.mock('@/lib/monthlyReview', async (orig) => ({
  ...(await orig<typeof import('@/lib/monthlyReview')>()),
  currentYearMonthInTaipei: () => ({ year: 2026, month: 9 }),
}))

const { default: MonthlyReviewPage } = await import('@/app/(dashboard)/review/[month]/page')

type Props = {
  viewer: { id: string }
  partner: { id: string } | null
  isSolo: boolean
  readOnly: boolean
  quiz: unknown
  pastMessages: { memberId: string }[]
  ownEditorMessage: unknown
  partnerEditorMessage: unknown
}
async function open(month: string): Promise<Props> {
  const el = (await MonthlyReviewPage({ params: Promise.resolve({ month }) })) as ReactElement<Props>
  return el.props
}

beforeEach(() => { quizLoader.mockClear() })

describe('B (left) viewing chapter 1 through the past-times pin', () => {
  beforeEach(() => { viewer = 'user-b'; window = CH1 })

  it('opens an A+B month instead of bouncing to /sign-in', async () => {
    const p = await open('2026-04')
    expect(p.viewer.id).toBe('user-b')
    expect(p.partner?.id).toBe('user-a')
    expect(p.isSolo).toBe(false)
  })

  it('sees both A and B messages from that chapter, and nothing C wrote', async () => {
    const p = await open('2026-04')
    expect(p.pastMessages.map((m) => m.memberId).sort()).toEqual(['user-a', 'user-b'])
  })

  it('is read-only: no editor, and no quiz from the group\'s current (A+C) session', async () => {
    const p = await open('2026-04')
    expect(p.readOnly).toBe(true)
    expect(p.quiz).toBeNull()
    expect(quizLoader).not.toHaveBeenCalled()
  })

  it('the chapter guard still applies: a chapter-2 month is 404', async () => {
    await expect(open('2026-07')).rejects.toThrow('NEXT_NOT_FOUND')
  })
})

describe('A (stayed) viewing chapter 1', () => {
  it('sees B — not C, the next partner — as the other half of that chapter', async () => {
    viewer = 'user-a'; window = CH1
    const p = await open('2026-04')
    expect(p.partner?.id).toBe('user-b')
  })
})

describe('access does not widen', () => {
  it('C (current chapter) still 404s on A+B months', async () => {
    viewer = 'user-c'; window = CH2
    await expect(open('2026-04')).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('C on a chapter-2 month: partner A, editable, live quiz loaded', async () => {
    viewer = 'user-c'; window = CH2
    const p = await open('2026-07')
    expect(p.partner?.id).toBe('user-a')
    expect(p.readOnly).toBe(false)
    expect(quizLoader).toHaveBeenCalledOnce()
    expect(p.pastMessages.map((m) => m.memberId).sort()).toEqual(['user-a', 'user-c'])
  })

  it('an outsider handed a chapter they are not in is refused (404), before any profile is read', async () => {
    viewer = 'user-x'; window = CH1
    requestedIds = []
    await expect(open('2026-04')).rejects.toThrow('NEXT_NOT_FOUND')
    expect(requestedIds).toEqual([])
  })
})
