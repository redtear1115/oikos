import { describe, it, expect, beforeEach, vi } from 'vitest'
import './_mocks/supabase'
import { mockDb, queueDbResult, resetDbMocks } from './_mocks/db'

// next/headers cookies() — controlled per test via the helper below.
const cookieStore = new Map<string, string>()
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (key: string) => {
      const value = cookieStore.get(key)
      return value === undefined ? undefined : { value }
    },
    set: vi.fn(),
    delete: vi.fn(),
  })),
}))

function setCookie(key: string, value: string | null) {
  if (value === null) cookieStore.delete(key)
  else cookieStore.set(key, value)
}

import {
  listEpochsForViewer,
  resolveViewerEpochContext,
  PAST_EPOCH_COOKIE,
} from '@/lib/db/queries/epoch'

const VIEWER = 'user-leaver'
const STAYER = 'user-stayer'
const OTHER = 'user-other'

function epochRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'epoch-1',
    groupId: 'grp-1',
    startedAt: new Date('2026-01-01T00:00:00Z'),
    endedAt: null,
    memberAId: VIEWER,
    memberBId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

function profileRow(id: string, displayName: string) {
  return { id, displayName }
}

function groupRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'grp-1',
    name: '我們家',
    memberA: VIEWER,
    memberB: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    defaultSplitRatioA: null,
    pendingSwapProposedBy: null,
    pendingSwapExpiresAt: null,
    currentEpochStartedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

beforeEach(() => {
  resetDbMocks()
  cookieStore.clear()
})

describe('listEpochsForViewer', () => {
  it('returns chapters across multiple groups, newest first, with partner names inlined', async () => {
    // Scenario: leaver was on X (duo with stayer), left for solo Y, then
    // re-joined X. They should see X's prior duo, Y's prior solo, plus X's
    // current re-joined duo — all rows where they were a member.
    const xDuoOld = epochRow({
      id: 'ep-x-1', groupId: 'grp-x',
      memberAId: STAYER, memberBId: VIEWER,
      startedAt: new Date('2025-01-01T00:00:00Z'),
      endedAt: new Date('2025-06-01T00:00:00Z'),
    })
    const ySolo = epochRow({
      id: 'ep-y-1', groupId: 'grp-y',
      memberAId: VIEWER, memberBId: null,
      startedAt: new Date('2025-06-01T00:00:00Z'),
      endedAt: new Date('2025-12-01T00:00:00Z'),
    })
    const xDuoNow = epochRow({
      id: 'ep-x-3', groupId: 'grp-x',
      memberAId: STAYER, memberBId: VIEWER,
      startedAt: new Date('2025-12-01T00:00:00Z'),
      endedAt: null,
    })

    // 1) main epochs SELECT (already ordered DESC startedAt in real SQL)
    queueDbResult([xDuoNow, ySolo, xDuoOld])
    // 2) profiles SELECT
    queueDbResult([profileRow(VIEWER, 'Leaver'), profileRow(STAYER, 'Stayer')])

    const rows = await listEpochsForViewer(VIEWER)

    expect(rows.map((r) => r.id)).toEqual(['ep-x-3', 'ep-y-1', 'ep-x-1'])
    expect(rows[0]).toMatchObject({
      groupId: 'grp-x',
      memberAName: 'Stayer',
      memberBName: 'Leaver',
    })
    expect(rows[1]).toMatchObject({
      groupId: 'grp-y',
      memberAName: 'Leaver',
      memberBName: null,
    })
    expect(rows[2]).toMatchObject({
      groupId: 'grp-x',
      memberAName: 'Stayer',
      memberBName: 'Leaver',
    })
  })

  it('returns [] without hitting profiles when the viewer has no chapters', async () => {
    queueDbResult([])

    const rows = await listEpochsForViewer('nobody')
    expect(rows).toEqual([])
    // Only the one epochs SELECT — no profiles lookup.
    expect(mockDb.select).toHaveBeenCalledTimes(1)
  })

  it('does not surface a stayer chapter the viewer was never on', async () => {
    // Acceptance: 「Member A (the stayer) does NOT see Y's epoch in their
    // past-times (they were never in Y)」. The query's WHERE clause is the
    // mechanism — verified here by passing no Y-row in the queued result for
    // the stayer's call.
    const xDuoOld = epochRow({
      id: 'ep-x-1', groupId: 'grp-x',
      memberAId: STAYER, memberBId: VIEWER,
      startedAt: new Date('2025-01-01T00:00:00Z'),
      endedAt: new Date('2025-06-01T00:00:00Z'),
    })
    const xSoloAfter = epochRow({
      id: 'ep-x-2', groupId: 'grp-x',
      memberAId: STAYER, memberBId: null,
      startedAt: new Date('2025-06-01T00:00:00Z'),
      endedAt: new Date('2025-12-01T00:00:00Z'),
    })
    const xDuoNow = epochRow({
      id: 'ep-x-3', groupId: 'grp-x',
      memberAId: STAYER, memberBId: VIEWER,
      startedAt: new Date('2025-12-01T00:00:00Z'),
      endedAt: null,
    })

    queueDbResult([xDuoNow, xSoloAfter, xDuoOld])
    queueDbResult([profileRow(STAYER, 'Stayer'), profileRow(VIEWER, 'Leaver')])

    const rows = await listEpochsForViewer(STAYER)

    expect(rows.map((r) => r.groupId)).toEqual(['grp-x', 'grp-x', 'grp-x'])
    expect(rows.find((r) => r.id === 'ep-y-1')).toBeUndefined()
  })
})

describe('resolveViewerEpochContext', () => {
  it('without a pin: returns active group + current open epoch window', async () => {
    // 1) getActiveGroupForUser SELECT
    queueDbResult([groupRow()])
    // 2) open-epoch SELECT
    const openEpoch = epochRow({ id: 'ep-current', endedAt: null })
    queueDbResult([openEpoch])

    const context = await resolveViewerEpochContext(VIEWER)
    expect(context).not.toBeNull()
    expect(context!.group.id).toBe('grp-1')
    expect(context!.window).toMatchObject({
      epochId: 'ep-current',
      isPast: false,
      endedAt: null,
    })
  })

  it('with a pin pointing to the viewer’s past chapter on a different group: swaps to that group + window', async () => {
    // This is the crux of #141: the viewer pins to Y's solo (group Y, not
    // active group X). resolveViewerEpochContext must return group Y, not X.
    // Y is the solo ledger they had before accepting an invite into X:
    // acceptInvite leaves them as Y's member_a and only closes Y's epoch, so
    // they are still a current member of Y and the pin is accepted (#1603).
    setCookie(PAST_EPOCH_COOKIE, 'ep-y-1')

    const yEpoch = epochRow({
      id: 'ep-y-1', groupId: 'grp-y',
      memberAId: VIEWER, memberBId: null,
      startedAt: new Date('2025-06-01T00:00:00Z'),
      endedAt: new Date('2025-12-01T00:00:00Z'),
    })
    const yGroup = groupRow({ id: 'grp-y', name: '我的家計簿', memberA: VIEWER, memberB: null })

    // 1) pin SELECT (epochs by id)
    queueDbResult([yEpoch])
    // 2) group SELECT (by epoch.groupId)
    queueDbResult([yGroup])

    const context = await resolveViewerEpochContext(VIEWER)
    expect(context).not.toBeNull()
    expect(context!.group.id).toBe('grp-y')
    expect(context!.window).toMatchObject({
      epochId: 'ep-y-1',
      isPast: true,
    })
    expect(context!.window.endedAt).toEqual(new Date('2025-12-01T00:00:00Z'))
  })

  it('with a pin pointing to a chapter the viewer was NOT a member of: falls back to active group', async () => {
    // Stale / hostile cookie pointing at someone else's epoch must not leak
    // their chapter into this viewer's context.
    setCookie(PAST_EPOCH_COOKIE, 'ep-not-mine')

    const otherEpoch = epochRow({
      id: 'ep-not-mine', groupId: 'grp-other',
      memberAId: OTHER, memberBId: null,
    })
    // 1) pin SELECT → returns the epoch but membership check rejects it
    queueDbResult([otherEpoch])
    // 2) getActiveGroupForUser SELECT
    queueDbResult([groupRow()])
    // 3) open-epoch SELECT
    queueDbResult([epochRow({ id: 'ep-current', endedAt: null })])

    const context = await resolveViewerEpochContext(VIEWER)
    expect(context).not.toBeNull()
    expect(context!.group.id).toBe('grp-1')
    expect(context!.window.isPast).toBe(false)
  })

  it('with a pin pointing to a non-existent epoch: falls back to active group', async () => {
    setCookie(PAST_EPOCH_COOKIE, 'ep-deleted')

    // 1) pin SELECT → no rows
    queueDbResult([])
    // 2) getActiveGroupForUser SELECT
    queueDbResult([groupRow()])
    // 3) open-epoch SELECT
    queueDbResult([epochRow({ id: 'ep-current', endedAt: null })])

    const context = await resolveViewerEpochContext(VIEWER)
    expect(context).not.toBeNull()
    expect(context!.group.id).toBe('grp-1')
  })

  // #1603 — a pin counts only if the viewer is named on the chapter AND is a
  // current member of its group. Before this, a former member's pin was
  // accepted, the layout found them missing from the group's members and
  // redirected to /sign-in, which sent them back to /dashboard: a loop.
  describe('former members (#1603)', () => {
    const leftChapter = () => epochRow({
      id: 'ep-x-1', groupId: 'grp-x',
      memberAId: STAYER, memberBId: VIEWER,
      startedAt: new Date('2025-01-01T00:00:00Z'),
      endedAt: new Date('2025-06-01T00:00:00Z'),
    })

    it('a leaver pinned to the ledger they left resolves to their own active group', async () => {
      setCookie(PAST_EPOCH_COOKIE, 'ep-x-1')
      // 1) pin SELECT → the leaver is named on the chapter…
      queueDbResult([leftChapter()])
      // 2) group SELECT → …but X's row today names only the stayer
      queueDbResult([groupRow({ id: 'grp-x', memberA: STAYER, memberB: null })])
      // 3) getActiveGroupForUser → the leaver's new solo ledger
      queueDbResult([groupRow({ id: 'grp-solo', memberA: VIEWER, memberB: null })])
      // 4) its open epoch
      queueDbResult([epochRow({ id: 'ep-solo', groupId: 'grp-solo', endedAt: null })])

      const context = await resolveViewerEpochContext(VIEWER)
      expect(context).not.toBeNull()
      expect(context!.group.id).toBe('grp-solo')
      expect(context!.window).toMatchObject({ epochId: 'ep-solo', isPast: false })
    })

    it('a leaver is refused even when the left ledger has a new partner in it', async () => {
      setCookie(PAST_EPOCH_COOKIE, 'ep-x-1')
      queueDbResult([leftChapter()])
      queueDbResult([groupRow({ id: 'grp-x', memberA: STAYER, memberB: OTHER })])
      queueDbResult([groupRow({ id: 'grp-solo', memberA: VIEWER, memberB: null })])
      queueDbResult([epochRow({ id: 'ep-solo', groupId: 'grp-solo', endedAt: null })])

      const context = await resolveViewerEpochContext(VIEWER)
      expect(context!.group.id).toBe('grp-solo')
      expect(context!.group.memberB).not.toBe(OTHER)
    })

    it('a removed person with no group resolves to null (→ /onboarding), not to the left ledger', async () => {
      setCookie(PAST_EPOCH_COOKIE, 'ep-x-1')
      queueDbResult([leftChapter()])
      queueDbResult([groupRow({ id: 'grp-x', memberA: STAYER, memberB: null })])
      // getActiveGroupForUser → removePartner leaves them with no ledger
      queueDbResult([])

      const context = await resolveViewerEpochContext(VIEWER)
      expect(context).toBeNull()
    })

    it('a stayer pinned to an old chapter of their current group resolves to the pin', async () => {
      setCookie(PAST_EPOCH_COOKIE, 'ep-x-1')
      queueDbResult([leftChapter()])
      // X today: the stayer and a new partner
      queueDbResult([groupRow({ id: 'grp-x', memberA: STAYER, memberB: OTHER })])

      const context = await resolveViewerEpochContext(STAYER)
      expect(context!.group.id).toBe('grp-x')
      expect(context!.window).toMatchObject({ epochId: 'ep-x-1', isPast: true })
    })
  })

  it('returns null when the viewer has neither a pin nor any group', async () => {
    // 1) getActiveGroupForUser SELECT → no rows
    queueDbResult([])

    const context = await resolveViewerEpochContext(VIEWER)
    expect(context).toBeNull()
  })
})
