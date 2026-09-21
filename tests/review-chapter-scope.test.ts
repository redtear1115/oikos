// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isMonthInChapter, taipeiMonthStart } from '@/lib/monthlyReview'
import { deriveReviewCell } from '@/lib/reviewCell'

// #1380 — monthly reviews follow the chapter, not the group (user decision
// 2026-09-21). Scenario used throughout:
//
//   chapter 1  A + B   2026-03-01 00:00 Taipei → 2026-06-15 (B leaves mid-June)
//   chapter 2  A + C   2026-06-15 → open (C joins the same day)
//
// Snapshots exist for March–May (A+B), June (straddles: A+B's first half, A+C's
// second), and July–August (A+C).

const TPE = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d) - 8 * 60 * 60 * 1000)
const CH1 = { startedAt: TPE(2026, 3, 1), endedAt: TPE(2026, 6, 15) }
const CH2 = { startedAt: TPE(2026, 6, 15), endedAt: null }
const SNAPSHOT_MONTHS = [3, 4, 5, 6, 7, 8].map((month) => ({ year: 2026, month }))
const monthsIn = (ch: typeof CH1 | typeof CH2) =>
  SNAPSHOT_MONTHS.filter((ym) => isMonthInChapter(ym, ch)).map((ym) => ym.month)

describe('isMonthInChapter — whole-month containment', () => {
  it('chapter 1 (A+B) sees March–May; chapter 2 (A+C) sees July–August', () => {
    expect(monthsIn(CH1)).toEqual([3, 4, 5])
    expect(monthsIn(CH2)).toEqual([7, 8])
  })

  it('the straddling month (June) belongs to neither chapter', () => {
    expect(isMonthInChapter({ year: 2026, month: 6 }, CH1)).toBe(false)
    expect(isMonthInChapter({ year: 2026, month: 6 }, CH2)).toBe(false)
  })

  it('boundaries are exact Taipei month instants: a chapter starting at 00:00 on the 1st owns that month', () => {
    const ch = { startedAt: taipeiMonthStart({ year: 2026, month: 7 }), endedAt: null }
    expect(isMonthInChapter({ year: 2026, month: 7 }, ch)).toBe(true)
    expect(isMonthInChapter({ year: 2026, month: 6 }, ch)).toBe(false)
    // One millisecond later and July straddles.
    const late = { startedAt: new Date(ch.startedAt.getTime() + 1), endedAt: null }
    expect(isMonthInChapter({ year: 2026, month: 7 }, late)).toBe(false)
  })

  it('a chapter ending exactly at a month boundary keeps the month before it', () => {
    const ch = { startedAt: TPE(2026, 1, 1), endedAt: taipeiMonthStart({ year: 2026, month: 5 }) }
    expect(isMonthInChapter({ year: 2026, month: 4 }, ch)).toBe(true)
    expect(isMonthInChapter({ year: 2026, month: 5 }, ch)).toBe(false)
  })
})

describe("C's 月回顧 cell shows none of A+B's months", () => {
  it('in July, last month (June) straddles → no "latest"; July/August not yet reviewed → empty', () => {
    const cChapterMonths = SNAPSHOT_MONTHS.filter((ym) => ym.month <= 6).filter((ym) => isMonthInChapter(ym, CH2))
    // What the dashboard passes: the raw June snapshot is dropped because June is not in C's chapter.
    const june = { year: 2026, month: 6 }
    const juneSnapshot = { bannerDismissedByMemberAAt: null, bannerDismissedByMemberBAt: null }
    const cell = deriveReviewCell({
      previousMonth: june,
      previousSnapshot: isMonthInChapter(june, CH2) ? juneSnapshot : null,
      viewerIsA: false,
      hasAnyReview: cChapterMonths.length > 0,
    })
    expect(cell).toEqual({ kind: 'empty' })
  })
})

// ─── /review/[month] guard, with the page's dependencies mocked ───

const notFound = vi.fn(() => { throw new Error('NEXT_NOT_FOUND') })
const loadSnapshot = vi.fn(async () => null)
vi.mock('next/navigation', () => ({ notFound, redirect: vi.fn(() => { throw new Error('NEXT_REDIRECT') }) }))
vi.mock('@/lib/supabase/server', () => ({ getCurrentUser: async () => ({ id: 'user-c' }) }))
vi.mock('@/lib/db/queries/epoch', () => ({
  getEpochMembers: async () => ({ memberAId: 'user-a', memberBId: 'user-c' }),
  resolveViewerEpochContext: async () => ({
    group: { id: 'g1', memberA: 'user-a', memberB: 'user-c' },
    window: { ...CH2, epochId: 'e2', isPast: false },
  }),
}))
vi.mock('@/lib/db/client', () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => [
      { id: 'user-a', displayName: 'A', avatarUrl: null },
      { id: 'user-c', displayName: 'C', avatarUrl: null },
    ] }) }),
  },
}))
vi.mock('@/lib/db/queries/monthlyReview', () => ({
  loadMonthlyReviewSnapshot: loadSnapshot,
  loadMonthlyReviewMessages: async () => [],
}))
vi.mock('@/lib/db/queries/partnerQuiz', () => ({
  loadPartnerQuizSessionByGroup: async () => null,
  loadPartnerQuizAnswers: async () => [],
}))
vi.mock('@/lib/monthlyReview', async (orig) => ({
  ...(await orig<typeof import('@/lib/monthlyReview')>()),
  currentYearMonthInTaipei: () => ({ year: 2026, month: 9 }),
}))

const { default: MonthlyReviewPage } = await import('@/app/(dashboard)/review/[month]/page')

describe('/review/[month] for C (chapter 2)', () => {
  beforeEach(() => { notFound.mockClear(); loadSnapshot.mockClear() })

  it.each(['2026-03', '2026-05', '2026-06'])('%s (A+B or straddling) → 404, before any snapshot or message is read', async (month) => {
    await expect(MonthlyReviewPage({ params: Promise.resolve({ month }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(loadSnapshot).not.toHaveBeenCalled()
  })

  it('2026-07 (inside C\'s chapter) renders', async () => {
    await expect(MonthlyReviewPage({ params: Promise.resolve({ month: '2026-07' }) })).resolves.toBeTruthy()
    expect(notFound).not.toHaveBeenCalled()
    expect(loadSnapshot).toHaveBeenCalledWith('g1', 2026, 7)
  })
})
