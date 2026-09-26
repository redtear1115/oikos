import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setMockUser } from './_mocks/supabase'
import { mockDb, queueDbResult, resetDbMocks } from './_mocks/db'

// Write-context gates for the actions that create ledger rows outside the
// AddSheet paths: asset creates that record a purchase, and the recurring
// pending confirms. Plus the member / same-group checks on the values those
// actions copy into the new row.
//
// next/headers cookies() — controlled per test. getViewerWriteContext reads
// PAST_EPOCH_COOKIE to decide whether the viewer is viewing a past chapter.
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

import { createCar, editCar, createHouse } from '@/actions/asset'
import {
  confirmPending as confirmPendingExpense,
  editAndConfirmPending as editAndConfirmPendingExpense,
} from '@/actions/recurringExpense'
import {
  confirmPending as confirmPendingIncome,
  editAndConfirmPending as editAndConfirmPendingIncome,
} from '@/actions/recurringIncome'
import { PAST_EPOCH_COOKIE } from '@/lib/db/queries/epoch'

const VIEWER = { id: 'user-a', email: 'a@example.com' }
const GROUP = { id: 'grp-1', memberA: 'user-a', memberB: 'user-b', name: '我們家' }
const OPEN_EPOCH = {
  id: 'epoch-current',
  groupId: 'grp-1',
  startedAt: new Date('2026-01-01T00:00:00Z'),
  endedAt: null,
  memberAId: 'user-a',
  memberBId: 'user-b',
}
const CLOSED_EPOCH = {
  id: 'epoch-old',
  groupId: 'grp-1',
  startedAt: new Date('2025-01-01T00:00:00Z'),
  endedAt: new Date('2025-12-31T23:59:59Z'),
  memberAId: 'user-a',
  memberBId: 'user-b',
}

const PENDING_EXPENSE = {
  id: 'pend-1', groupId: GROUP.id,
  proposedAmount: 25000, proposedDate: '2026-06-01',
  proposedDescription: '房租', proposedPaidBy: 'user-a',
  proposedSplitType: 'half', proposedSplitRatioA: null,
  category: 'housing', assetId: null, assetGroupId: null,
}
const PENDING_INCOME = {
  id: 'pend-2', groupId: GROUP.id,
  proposedAmount: 75000, proposedDate: '2026-05-25',
  recipientId: 'user-a', category: 'salary',
  source: '月薪', assetId: null, assetGroupId: null,
}

beforeEach(() => {
  resetDbMocks()
  setMockUser(VIEWER)
  cookieStore.clear()
})

/** The viewer is looking at a closed chapter of their group. */
function pinPastChapter() {
  cookieStore.set(PAST_EPOCH_COOKIE, CLOSED_EPOCH.id)
  queueDbResult([CLOSED_EPOCH])  // pinned epoch lookup
  queueDbResult([GROUP])         // group of the pinned epoch
}

/** The viewer is in the current chapter (no pin). */
function currentChapter(group: object = GROUP) {
  queueDbResult([group])         // getActiveGroupForUser
  queueDbResult([OPEN_EPOCH])    // open epoch lookup
}

describe('write-context gate while viewing a past chapter', () => {
  it('createCar is refused and writes nothing', async () => {
    pinPastChapter()
    await expect(createCar({
      name: '阿白', plate: 'ABC-1234', purchasedAt: '2026-04-01', purchasePrice: 500000,
    })).rejects.toThrow('過去章節不可編輯')
    expect(mockDb.insert).not.toHaveBeenCalled()
    expect(mockDb.transaction).not.toHaveBeenCalled()
  })

  it('createHouse is refused and writes nothing', async () => {
    pinPastChapter()
    await expect(createHouse({ name: '我們家', purchasePrice: 15000000 }))
      .rejects.toThrow('過去章節不可編輯')
    expect(mockDb.insert).not.toHaveBeenCalled()
    expect(mockDb.transaction).not.toHaveBeenCalled()
  })

  it('recurring expense confirmPending is refused and writes nothing', async () => {
    pinPastChapter()
    await expect(confirmPendingExpense('pend-1')).rejects.toThrow('過去章節不可編輯')
    expect(mockDb.insert).not.toHaveBeenCalled()
    expect(mockDb.transaction).not.toHaveBeenCalled()
  })

  it('recurring expense editAndConfirmPending is refused and writes nothing', async () => {
    pinPastChapter()
    await expect(editAndConfirmPendingExpense({
      pendingId: 'pend-1', overrides: { amount: 26000 },
    })).rejects.toThrow('過去章節不可編輯')
    expect(mockDb.insert).not.toHaveBeenCalled()
    expect(mockDb.transaction).not.toHaveBeenCalled()
  })

  it('recurring income confirmPending is refused and writes nothing', async () => {
    pinPastChapter()
    await expect(confirmPendingIncome('pend-2')).rejects.toThrow('過去章節不可編輯')
    expect(mockDb.insert).not.toHaveBeenCalled()
    expect(mockDb.transaction).not.toHaveBeenCalled()
  })

  it('recurring income editAndConfirmPending is refused and writes nothing', async () => {
    pinPastChapter()
    await expect(editAndConfirmPendingIncome({
      pendingId: 'pend-2', amount: 80000, category: 'salary',
      recipientId: 'user-a', occurredAt: '2026-05-25',
    })).rejects.toThrow('過去章節不可編輯')
    expect(mockDb.insert).not.toHaveBeenCalled()
    expect(mockDb.transaction).not.toHaveBeenCalled()
  })
})

describe('car primary user must be a current member', () => {
  it('createCar refuses a primary user outside the group and writes nothing', async () => {
    currentChapter()
    expect(await createCar({
      name: '阿白', plate: 'ABC-1234', purchasedAt: '2026-04-01', purchasePrice: 500000,
      primaryUserId: 'user-x',
    })).toEqual({ ok: false, code: 'primary_user_not_in_group' })
    expect(mockDb.insert).not.toHaveBeenCalled()
    expect(mockDb.transaction).not.toHaveBeenCalled()
  })

  it('editCar refuses changing the primary user to someone outside the group', async () => {
    queueDbResult([GROUP])                        // requireViewerGroup
    queueDbResult([{ id: 'asset-1' }])            // assets update .returning (ownership)
    queueDbResult([{ primaryUserId: 'user-b' }])  // stored primary user

    expect(await editCar({
      id: 'asset-1', name: '阿白', purchasedAt: null, purchasePrice: null,
      primaryUserId: 'user-x',
    })).toEqual({ ok: false, code: 'primary_user_not_in_group' })
    // Only the ownership-proving Assets update ran; CarDetails was not touched
    // (and the transaction rolled back on the throw).
    expect(mockDb.update).toHaveBeenCalledTimes(1)
  })

  it('editCar keeps an unchanged stored primary user who is no longer a member', async () => {
    queueDbResult([GROUP])                        // requireViewerGroup
    queueDbResult([{ id: 'asset-1' }])            // assets update .returning
    queueDbResult([{ primaryUserId: 'user-x' }])  // stored primary user (left in place)
    queueDbResult([])                             // carDetails update

    expect(await editCar({
      id: 'asset-1', name: '改名', purchasedAt: null, purchasePrice: null,
      primaryUserId: 'user-x',
    })).toEqual({ ok: true, data: undefined })
    expect(mockDb.update).toHaveBeenCalledTimes(2)
  })
})

describe('recurring confirmPending re-checks the rule against the group', () => {
  it('income confirmPending refuses a rule recipient outside the group', async () => {
    currentChapter()
    queueDbResult([{ ...PENDING_INCOME, recipientId: 'user-x' }])

    expect(await confirmPendingIncome('pend-2'))
      .toEqual({ ok: false, code: 'recipient_not_in_group' })
    expect(mockDb.insert).not.toHaveBeenCalled()
    expect(mockDb.transaction).not.toHaveBeenCalled()
  })

  it('income confirmPending refuses a rule asset that belongs to another group', async () => {
    currentChapter()
    queueDbResult([{ ...PENDING_INCOME, assetId: 'asset-9', assetGroupId: 'grp-other' }])

    expect(await confirmPendingIncome('pend-2'))
      .toEqual({ ok: false, code: 'linked_asset_not_in_group' })
    expect(mockDb.insert).not.toHaveBeenCalled()
    expect(mockDb.transaction).not.toHaveBeenCalled()
  })

  it('expense confirmPending refuses a rule asset that belongs to another group', async () => {
    currentChapter()
    queueDbResult([{ ...PENDING_EXPENSE, assetId: 'asset-9', assetGroupId: 'grp-other' }])

    expect(await confirmPendingExpense('pend-1'))
      .toEqual({ ok: false, code: 'linked_asset_not_in_group' })
    expect(mockDb.insert).not.toHaveBeenCalled()
    expect(mockDb.transaction).not.toHaveBeenCalled()
  })

  it('expense confirmPending still confirms when the rule asset is in the group', async () => {
    currentChapter()
    queueDbResult([{ ...PENDING_EXPENSE, assetId: 'asset-1', assetGroupId: GROUP.id }])
    queueDbResult([{ id: 'tx-1' }])     // tx insert CashTx
    queueDbResult([{ id: 'pend-1' }])   // tx update pending
    queueDbResult([])                   // recalcGroupBalance execute

    expect(await confirmPendingExpense('pend-1')).toEqual({ ok: true, data: { txId: 'tx-1' } })
  })

  it('income confirmPending still confirms for a member recipient and in-group asset', async () => {
    currentChapter()
    queueDbResult([{ ...PENDING_INCOME, assetId: 'asset-1', assetGroupId: GROUP.id }])
    queueDbResult([{ id: 'tx-2' }])     // tx insert IncomeTx
    queueDbResult([{ id: 'pend-2' }])   // tx update pending

    expect(await confirmPendingIncome('pend-2')).toEqual({ ok: true, data: { txId: 'tx-2' } })
  })
})
