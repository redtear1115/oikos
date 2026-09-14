import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * #1139 — `partner_quiz_started` used to live inside `startPartnerQuizSession()`,
 * a server action with no production caller. The real session is created inline
 * by this page, so the event never fired once in prod while
 * `partner_quiz_completed` kept firing normally — a funnel built on the pair
 * divides by zero and looks like a finding rather than a bug.
 *
 * The event now sits in the page's lazy-insert success branch. The thing worth
 * guarding is not that it fires at all but that it fires *once*: the page is a
 * Server Component that re-runs on every visit and every `router.refresh()`, so
 * an event placed one indentation level too far out would count each refresh as
 * a new start and re-inflate the same number in the opposite direction.
 */

const h = vi.hoisted(() => ({
  captureServer: vi.fn(async () => {}),
  getCurrentUser: vi.fn(),
  resolveViewerEpochContext: vi.fn(),
  loadPartnerQuizSessionByGroup: vi.fn(),
  loadPartnerQuizAnswers: vi.fn(async () => []),
}))

vi.mock('@/lib/analytics/server', () => ({ captureServer: h.captureServer }))
vi.mock('@/lib/supabase/server', () => ({ getCurrentUser: h.getCurrentUser }))
vi.mock('@/lib/db/queries/epoch', () => ({
  resolveViewerEpochContext: h.resolveViewerEpochContext,
}))
vi.mock('@/lib/db/queries/partnerQuiz', () => ({
  loadPartnerQuizSessionByGroup: h.loadPartnerQuizSessionByGroup,
  loadPartnerQuizAnswers: h.loadPartnerQuizAnswers,
}))
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`) }),
}))
// The page only needs to *return* this element; rendering is out of scope here
// and its subtree would drag the whole client-component tree into the test.
vi.mock('@/app/(dashboard)/review/[month]/quiz/_components/QuizClient', () => ({
  QuizClient: () => null,
}))

import { mockDb, queueDbResult, resetDbMocks } from './_mocks/db'
import PartnerQuizPage from '@/app/(dashboard)/review/[month]/quiz/page'

const VIEWER = { id: 'user-a', email: 'a@example.com' }
const GROUP = { id: 'grp-1', memberA: 'user-a', memberB: 'user-b' }
const QUESTION_KEYS = ['impulse', 'risk', 'transparency']
const PROFILE_ROWS = [
  { id: 'user-a', displayName: 'A', avatarUrl: null },
  { id: 'user-b', displayName: 'B', avatarUrl: null },
]
const EXISTING_SESSION = {
  id: 'sess-1',
  groupId: GROUP.id,
  questionKeys: QUESTION_KEYS,
  createdAt: new Date('2026-08-02T00:00:00Z'),
  revealedAt: null,
}

// A month in the past relative to any run date this repo will see — the page
// 404s on future months before it ever reaches the session logic.
const params = Promise.resolve({ month: '2026-08' })

function renderPage() {
  return PartnerQuizPage({ params })
}

beforeEach(() => {
  resetDbMocks()
  vi.clearAllMocks()
  h.getCurrentUser.mockResolvedValue(VIEWER)
  h.resolveViewerEpochContext.mockResolvedValue({ group: GROUP })
  h.loadPartnerQuizAnswers.mockResolvedValue([])
})

describe('partner_quiz_started (#1139)', () => {
  it('fires once when the page actually inserts the session', async () => {
    h.loadPartnerQuizSessionByGroup.mockResolvedValueOnce(null)
    queueDbResult(PROFILE_ROWS)
    queueDbResult([{ ...EXISTING_SESSION, id: 'sess-new' }])

    await renderPage()

    expect(mockDb.insert).toHaveBeenCalledTimes(1)
    expect(h.captureServer).toHaveBeenCalledTimes(1)
    expect(h.captureServer).toHaveBeenCalledWith(
      VIEWER.id,
      'partner_quiz_started',
      { question_count: 3 },
    )
  })

  it('does NOT fire when the page re-renders on an existing session', async () => {
    // This is the refresh / second-visit path: the Server Component re-runs in
    // full, finds the session, and must stay silent.
    h.loadPartnerQuizSessionByGroup.mockResolvedValue(EXISTING_SESSION)
    queueDbResult(PROFILE_ROWS)

    await renderPage()

    expect(mockDb.insert).not.toHaveBeenCalled()
    expect(h.captureServer).not.toHaveBeenCalled()
  })

  // This is the test that pins `createdNew`. The "two refreshes" case below
  // passes with or without the flag, because a later visit never enters the
  // `if (!session)` block at all — so don't delete this one believing that
  // one covers the guard. Verified by mutation: dropping `if (createdNew)`
  // fails here and nowhere else in this file.
  it('does NOT fire on the UNIQUE-conflict re-read (partner created it first)', async () => {
    // Both members opened the link at once; our insert loses the race and the
    // page re-reads. That is not a start — the winner already reported one.
    h.loadPartnerQuizSessionByGroup
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(EXISTING_SESSION)
    mockDb.insert.mockImplementationOnce(() => {
      throw new Error('duplicate key value violates unique constraint')
    })
    queueDbResult(PROFILE_ROWS)

    await renderPage()

    expect(h.loadPartnerQuizSessionByGroup).toHaveBeenCalledTimes(2)
    expect(h.captureServer).not.toHaveBeenCalled()
  })

  it('stays silent across a create followed by two refreshes (net: one event)', async () => {
    // The regression this file exists for, spelled out end to end.
    h.loadPartnerQuizSessionByGroup.mockResolvedValueOnce(null)
    queueDbResult(PROFILE_ROWS)
    queueDbResult([{ ...EXISTING_SESSION, id: 'sess-new' }])
    await renderPage()

    h.loadPartnerQuizSessionByGroup.mockResolvedValue(EXISTING_SESSION)
    queueDbResult(PROFILE_ROWS)
    await renderPage()
    queueDbResult(PROFILE_ROWS)
    await renderPage()

    expect(h.captureServer).toHaveBeenCalledTimes(1)
  })
})
