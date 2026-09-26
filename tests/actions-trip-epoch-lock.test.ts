import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setMockUser } from './_mocks/supabase'
import { mockDb, mockBuilder, queueDbResult, resetDbMocks } from './_mocks/db'

// #1290 — trip writes take the open chapter row FOR SHARE after the trip row,
// and fail closed when that row is missing or is not the trip's chapter (a
// chapter close got there first). The real interleavings are in
// __tests__/actions/trip.epochLock.test.ts; this pins the refusal paths
// without a database.
//
// What it looks like when this regresses: nothing errors. The write commits,
// and whatever it produced (summary rows, a trip expense) belongs to a
// chapter that has already closed, or shows up in the next one.

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn() })),
}))
vi.mock('@/lib/analytics/server', () => ({
  captureServer: vi.fn(async () => {}),
  isUserFirstNonDeletedRecord: vi.fn(async () => false),
}))

import { endTrip, updateTrip, softDeleteTrip } from '@/actions/trip'
import { createTripExpense, editTripExpense, softDeleteTripExpense } from '@/actions/tripExpense'

const VIEWER = { id: 'user-a', email: 'a@example.com' }
const GROUP = {
  id: 'grp-1',
  memberA: 'user-a',
  memberB: 'user-b',
  name: '我們家',
  baseCurrency: 'TWD',
  currentEpochStartedAt: new Date('2026-01-01T00:00:00Z'),
}
const OPEN_EPOCH = {
  id: 'epoch-current',
  groupId: 'grp-1',
  startedAt: new Date('2026-01-01T00:00:00Z'),
  endedAt: null,
  memberAId: 'user-a',
  memberBId: 'user-b',
}
const TRIP = {
  id: 'trip-1',
  groupId: 'grp-1',
  epochId: 'epoch-current',
  name: '京都',
  startDate: '2026-03-01',
  endDate: null,
  defaultCurrency: 'TWD',
  budgetAmount: null,
  budgetCurrency: null,
  coverPhotoUrl: null,
  status: 'active',
  endedAt: null,
  deletedAt: null,
  rateSnapshot: { default: 'TWD', entries: [{ code: 'TWD', label: null, rate: 1 }] },
}
const EXPENSE_INPUT = {
  tripId: 'trip-1',
  paidBy: 'user-a',
  amount: 100,
  category: 'food',
  splitType: 'all_mine' as const,
}

/** What the open-chapter lock can return once the trip row is held. */
const LOCK_CASES: Array<[string, unknown[]]> = [
  ['no open chapter any more', []],
  ['a different chapter is open', [{ id: 'epoch-next' }]],
]

function queueViewer() {
  queueDbResult([GROUP])      // getViewerWriteContext → group lookup
  queueDbResult([OPEN_EPOCH]) // getViewerWriteContext → open chapter lookup
}

beforeEach(() => {
  resetDbMocks()
  setMockUser(VIEWER)
})

function forShareCalls(): number {
  return mockBuilder.for.mock.calls.filter((c) => c[0] === 'share').length
}

describe.each(LOCK_CASES)('trip writes fail closed when %s', (_label, lockRows) => {
  it('endTrip → active_trip_not_found, no summary rows', async () => {
    queueViewer()
    queueDbResult([TRIP])   // status UPDATE … returning
    queueDbResult(lockRows) // open chapter FOR SHARE
    expect(await endTrip({ tripId: 'trip-1', endDate: '2026-03-05' }))
      .toEqual({ ok: false, code: 'active_trip_not_found' })
    expect(mockDb.insert).not.toHaveBeenCalled()
    expect(forShareCalls()).toBe(1)
  })

  it('updateTrip → trip_not_found', async () => {
    queueViewer()
    queueDbResult([TRIP])   // existing trip
    queueDbResult([TRIP])   // UPDATE … returning
    queueDbResult(lockRows) // open chapter FOR SHARE
    expect(await updateTrip({ tripId: 'trip-1', name: '大阪' }))
      .toEqual({ ok: false, code: 'trip_not_found' })
    expect(forShareCalls()).toBe(1)
  })

  it('softDeleteTrip → trip_not_found', async () => {
    queueViewer()
    queueDbResult([{ id: 'trip-1', epochId: 'epoch-current' }]) // UPDATE … returning
    queueDbResult(lockRows)                                     // open chapter FOR SHARE
    expect(await softDeleteTrip({ tripId: 'trip-1' }))
      .toEqual({ ok: false, code: 'trip_not_found' })
    expect(forShareCalls()).toBe(1)
  })

  it('createTripExpense → trip_not_found, no row', async () => {
    queueViewer()
    queueDbResult([TRIP])   // trip FOR SHARE
    queueDbResult(lockRows) // open chapter FOR SHARE
    expect(await createTripExpense(EXPENSE_INPUT))
      .toEqual({ ok: false, code: 'trip_not_found' })
    expect(mockDb.insert).not.toHaveBeenCalled()
    expect(forShareCalls()).toBe(2)
  })

  it('editTripExpense → trip_not_found, nothing replaced', async () => {
    queueViewer()
    queueDbResult([TRIP])
    queueDbResult(lockRows)
    expect(await editTripExpense({ ...EXPENSE_INPUT, id: 'exp-1' }))
      .toEqual({ ok: false, code: 'trip_not_found' })
    expect(mockDb.update).not.toHaveBeenCalled()
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it('softDeleteTripExpense → trip_not_found, nothing deleted', async () => {
    queueViewer()
    queueDbResult([TRIP])
    queueDbResult(lockRows)
    expect(await softDeleteTripExpense({ id: 'exp-1', tripId: 'trip-1' }))
      .toEqual({ ok: false, code: 'trip_not_found' })
    expect(mockDb.update).not.toHaveBeenCalled()
  })
})

describe('trip writes go through when the trip\'s chapter is still open', () => {
  it('createTripExpense inserts after both locks', async () => {
    queueViewer()
    queueDbResult([TRIP])
    queueDbResult([{ id: 'epoch-current' }])
    queueDbResult([{ id: 'exp-new', tripId: 'trip-1' }]) // insert … returning
    expect(await createTripExpense(EXPENSE_INPUT)).toMatchObject({ ok: true })
    expect(mockDb.insert).toHaveBeenCalledTimes(1)
    expect(forShareCalls()).toBe(2)
  })

  it('an ended trip still reads trip_ended once its chapter is confirmed open', async () => {
    queueViewer()
    queueDbResult([{ ...TRIP, status: 'ended' }])
    queueDbResult([{ id: 'epoch-current' }])
    expect(await createTripExpense(EXPENSE_INPUT)).toEqual({ ok: false, code: 'trip_ended' })
    expect(mockDb.insert).not.toHaveBeenCalled()
  })
})
