// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setMockUser } from './_mocks/supabase'
import { mockDb, mockBuilder, queueDbResult, resetDbMocks } from './_mocks/db'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('@/lib/analytics/server', () => ({ captureServer: vi.fn() }))

import { setBaseCurrency } from '@/actions/currency'

// #943 (#1378 re-verify P3): setBaseCurrency checks and updates inside one
// transaction, after locking the group row — the same row createOuting takes
// FOR SHARE — so an outing can never be opened in a base that is about to change.

const GROUP = {
  id: 'grp-1', memberA: 'user-a', memberB: 'user-b', name: 'x',
  baseCurrency: 'twd', currentEpochStartedAt: new Date('2026-01-01T00:00:00Z'), defaultSplitRatioA: null,
}
const LOCKED = { id: 'grp-1', baseCurrency: 'twd', currentEpochStartedAt: GROUP.currentEpochStartedAt }

beforeEach(() => {
  resetDbMocks()
  setMockUser({ id: 'user-a', email: 'a@example.com' })
})

describe('setBaseCurrency — lock, then check, then update, in one transaction', () => {
  it('locks the group row FOR UPDATE inside the transaction before counting records', async () => {
    queueDbResult([GROUP])       // requireViewerGroup
    queueDbResult([LOCKED])      // tx: OikosGroups … FOR UPDATE
    for (let i = 0; i < 4; i++) queueDbResult([{ n: 0 }]) // cash / income / settlement / active outing
    expect(await setBaseCurrency({ currency: 'jpy' })).toEqual({ ok: true, data: undefined })
    expect(mockDb.transaction).toHaveBeenCalledOnce()
    expect(mockBuilder.for).toHaveBeenCalledWith('update')
    expect(mockBuilder.set).toHaveBeenCalledWith({ baseCurrency: 'jpy' })
    // The lock is taken before the first count: `.for` was called before any `.set`.
    expect(mockBuilder.for.mock.invocationCallOrder[0]).toBeLessThan(mockBuilder.set.mock.invocationCallOrder[0])
  })

  it('an active outing (4th count) locks the currency; nothing is written', async () => {
    queueDbResult([GROUP])
    queueDbResult([LOCKED])
    queueDbResult([{ n: 0 }]); queueDbResult([{ n: 0 }]); queueDbResult([{ n: 0 }])
    queueDbResult([{ n: 1 }])    // active outing
    expect(await setBaseCurrency({ currency: 'jpy' })).toEqual({ ok: false, code: 'base_currency_locked' })
    expect(mockBuilder.set).not.toHaveBeenCalled()
  })

  it('re-reads the base under the lock: already switched by a concurrent call → no-op', async () => {
    queueDbResult([GROUP])                               // context still says twd
    queueDbResult([{ ...LOCKED, baseCurrency: 'jpy' }])  // committed value under the lock is jpy
    expect(await setBaseCurrency({ currency: 'jpy' })).toEqual({ ok: true, data: undefined })
    expect(mockBuilder.set).not.toHaveBeenCalled()
  })
})
