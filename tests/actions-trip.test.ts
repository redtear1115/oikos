import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setMockUser } from './_mocks/supabase'
import { mockDb, mockBuilder, queueDbResult, resetDbMocks } from './_mocks/db'

// updateTrip resolves the viewer through getViewerWriteContext, which reads
// the past-chapter pin cookie. No pin here: the viewer is in the open chapter.
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn() })),
}))

import { updateTrip, type UpdateTripInput } from '@/actions/trip'

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
const EXISTING_TRIP = {
  id: 'trip-1',
  groupId: 'grp-1',
  epochId: 'epoch-current',
  name: '京都',
  startDate: '2026-03-01',
  endDate: '2026-03-05',
  defaultCurrency: 'TWD',
  budgetAmount: null,
  budgetCurrency: null,
  coverPhotoUrl: null,
  status: 'active',
  endedAt: null,
  deletedAt: null,
  rateSnapshot: { default: 'TWD', entries: [{ code: 'TWD', label: null, rate: 1 }] },
}

/** Every column updateTrip is allowed to write — see TripEditPatch in actions/trip.ts. */
const ALLOWED_COLUMNS = new Set([
  'name',
  'startDate',
  'endDate',
  'budgetAmount',
  'budgetCurrency',
  'rateSnapshot',
  'defaultCurrency',
])

function queueHappyPath() {
  queueDbResult([GROUP])          // getViewerWriteContext → group lookup (.limit)
  queueDbResult([OPEN_EPOCH])     // getViewerWriteContext → open epoch lookup (.limit)
  queueDbResult([EXISTING_TRIP])  // existing trip lookup (.limit)
  queueDbResult([{ ...EXISTING_TRIP }]) // update .returning
}

function setPayloads(): Record<string, unknown>[] {
  return mockBuilder.set.mock.calls.map((call) => call[0] as Record<string, unknown>)
}

beforeEach(() => {
  resetDbMocks()
  setMockUser(VIEWER)
})

describe('updateTrip — column allow-list', () => {
  it('drops ownership / lifecycle keys smuggled into the payload', async () => {
    queueHappyPath()

    const crafted = {
      tripId: 'trip-1',
      name: '大阪',
      groupId: 'grp-other',
      epochId: 'epoch-other',
      status: 'active',
      endedAt: null,
      deletedAt: null,
      coverPhotoUrl: 'https://example.com/x.png',
      createdAt: new Date('2020-01-01T00:00:00Z'),
      id: 'trip-other',
    } as unknown as UpdateTripInput

    const result = await updateTrip(crafted)
    expect(result.ok).toBe(true)

    expect(mockDb.update).toHaveBeenCalledTimes(1)
    const payloads = setPayloads()
    expect(payloads).toHaveLength(1)
    expect(payloads[0]).toEqual({ name: '大阪' })
    for (const key of Object.keys(payloads[0])) {
      expect(ALLOWED_COLUMNS.has(key)).toBe(true)
    }
    for (const forbidden of ['groupId', 'epochId', 'status', 'endedAt', 'deletedAt', 'coverPhotoUrl', 'createdAt', 'id', 'tripId']) {
      expect(payloads[0]).not.toHaveProperty(forbidden)
    }
  })

  it('writes only allow-listed columns even when every field is sent alongside extras', async () => {
    queueHappyPath()

    const crafted = {
      tripId: 'trip-1',
      name: '  大阪  ',
      startDate: '2026-03-02',
      endDate: '2026-03-06',
      budgetAmount: 50000,
      budgetCurrency: 'jpy',
      currencies: { default: 'TWD', entries: [{ code: 'JPY', label: null, rate: 0.21 }] },
      groupId: 'grp-other',
      epochId: 'epoch-other',
      status: 'ended',
      endedAt: new Date(),
      deletedAt: new Date(),
      coverPhotoUrl: 'https://example.com/x.png',
    } as unknown as UpdateTripInput

    const result = await updateTrip(crafted)
    expect(result.ok).toBe(true)

    const [payload] = setPayloads()
    expect(new Set(Object.keys(payload))).toEqual(ALLOWED_COLUMNS)
  })
})

describe('updateTrip — legitimate edits still apply', () => {
  it('writes the TripSheet edit payload (name / dates / currencies)', async () => {
    queueHappyPath()

    // Mirrors the call in app/(dashboard)/trips/_components/TripSheet.tsx.
    const result = await updateTrip({
      tripId: 'trip-1',
      name: '大阪',
      startDate: '2026-03-02',
      endDate: null,
      currencies: {
        default: 'TWD',
        entries: [
          { code: 'TWD', label: null, rate: 1 },
          { code: 'jpy', label: '日圓', rate: 0.21 },
        ],
      },
    })
    expect(result.ok).toBe(true)

    const [payload] = setPayloads()
    expect(payload).toEqual({
      name: '大阪',
      startDate: '2026-03-02',
      endDate: null,
      defaultCurrency: 'TWD',
      rateSnapshot: {
        default: 'TWD',
        entries: [
          { code: 'TWD', label: null, rate: 1 },
          { code: 'JPY', label: '日圓', rate: 0.21 },
        ],
      },
    })
  })

  it('trims the name and uppercases the budget currency', async () => {
    queueHappyPath()

    const result = await updateTrip({
      tripId: 'trip-1',
      name: '  大阪  ',
      budgetAmount: 30000,
      budgetCurrency: 'jpy',
    })
    expect(result.ok).toBe(true)

    const [payload] = setPayloads()
    expect(payload).toEqual({ name: '大阪', budgetAmount: 30000, budgetCurrency: 'JPY' })
  })

  it('clears budget fields when null is sent', async () => {
    queueHappyPath()

    await updateTrip({ tripId: 'trip-1', budgetAmount: null, budgetCurrency: null })

    const [payload] = setPayloads()
    expect(payload).toEqual({ budgetAmount: null, budgetCurrency: null })
  })
})

describe('updateTrip — field validation', () => {
  it('rejects an empty name with trip_name_empty', async () => {
    queueDbResult([GROUP])
    queueDbResult([OPEN_EPOCH])
    expect(await updateTrip({ tripId: 'trip-1', name: '   ' }))
      .toEqual({ ok: false, code: 'trip_name_empty' })
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it('rejects a name over 100 chars with trip_name_too_long', async () => {
    queueDbResult([GROUP])
    queueDbResult([OPEN_EPOCH])
    expect(await updateTrip({ tripId: 'trip-1', name: 'x'.repeat(101) }))
      .toEqual({ ok: false, code: 'trip_name_too_long' })
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it('rejects an endDate before the existing startDate', async () => {
    queueDbResult([GROUP])
    queueDbResult([OPEN_EPOCH])
    queueDbResult([EXISTING_TRIP])
    expect(await updateTrip({ tripId: 'trip-1', endDate: '2026-02-01' }))
      .toEqual({ ok: false, code: 'trip_end_before_start' })
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it('still rejects moving the start into a past epoch', async () => {
    queueDbResult([GROUP])
    queueDbResult([OPEN_EPOCH])
    expect(await updateTrip({ tripId: 'trip-1', startDate: '2025-12-31' }))
      .toEqual({ ok: false, code: 'trip_move_to_past_epoch' })
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it.each([
    ['name', { name: 42 }],
    ['startDate', { startDate: '2026/03/01' }],
    ['endDate', { endDate: 20260301 }],
    ['budgetAmount', { budgetAmount: -1 }],
    ['budgetAmount (non-integer)', { budgetAmount: 1.5 }],
    ['budgetCurrency', { budgetCurrency: { toUpperCase: 1 } }],
  ])('rejects a malformed %s without writing', async (_label, extra) => {
    queueDbResult([GROUP])
    queueDbResult([OPEN_EPOCH])
    queueDbResult([EXISTING_TRIP])
    await expect(updateTrip({ tripId: 'trip-1', ...extra } as unknown as UpdateTripInput))
      .rejects.toThrow()
    expect(mockDb.update).not.toHaveBeenCalled()
  })
})
