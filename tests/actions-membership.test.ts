import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { setMockUser } from './_mocks/supabase'

// next/headers cookies(): leaveGroup reads the leaver's locale cookie (#1622).
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
import { mockDb, mockBuilder, queueDbResult, resetDbMocks } from './_mocks/db'
import {
  proposeSwap,
  cancelSwap,
  confirmSwap,
  leaveGroup,
  removePartner,
} from '@/actions/membership'
import { LOCALE_COOKIE, SUPPORTED_LOCALES, dictionaries } from '@/lib/i18n/t'

const VIEWER_A = { id: 'user-a', email: 'a@example.com' }
const VIEWER_B = { id: 'user-b', email: 'b@example.com' }

function duoGroup(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'grp-1',
    name: '我們家',
    memberA: 'user-a',
    memberB: 'user-b',
    createdAt: new Date(),
    defaultSplitRatioA: null,
    pendingSwapProposedBy: null,
    pendingSwapExpiresAt: null,
    currentEpochStartedAt: new Date(),
    ...overrides,
  }
}

beforeEach(() => {
  resetDbMocks()
  cookieStore.clear()
})

// ─── proposeSwap ─────────────────────────────────────────────────────────────

describe('proposeSwap', () => {
  it('sets pending proposed-by + expiry on a duo group', async () => {
    setMockUser(VIEWER_A)
    queueDbResult([duoGroup()])
    await proposeSwap()
    const set = mockBuilder.set.mock.calls[0][0] as Record<string, unknown>
    expect(set.pendingSwapProposedBy).toBe('user-a')
    expect(set.pendingSwapExpiresAt).toBeInstanceOf(Date)
  })

  it('rejects when a swap is already pending', async () => {
    setMockUser(VIEWER_A)
    queueDbResult([duoGroup({ pendingSwapProposedBy: 'user-b' })])
    expect(await proposeSwap()).toEqual({ ok: false, code: 'swap_already_pending' })
  })

  it('rejects in a solo group (memberB null)', async () => {
    setMockUser(VIEWER_A)
    queueDbResult([duoGroup({ memberB: null })])
    expect(await proposeSwap()).toEqual({ ok: false, code: 'solo_group' })
  })

  it('throws unauthorized with no user', async () => {
    setMockUser(null)
    await expect(proposeSwap()).rejects.toThrow('Unauthorized')
  })

  it('throws when no group is found', async () => {
    setMockUser(VIEWER_A)
    queueDbResult([])
    await expect(proposeSwap()).rejects.toThrow('找不到家計簿')
  })
})

// ─── cancelSwap ──────────────────────────────────────────────────────────────

describe('cancelSwap', () => {
  it('clears pending fields when a proposer cancels their own proposal', async () => {
    setMockUser(VIEWER_A)
    queueDbResult([duoGroup({
      pendingSwapProposedBy: 'user-a',
      pendingSwapExpiresAt: new Date('2099-01-01'),
    })])
    await cancelSwap()
    const set = mockBuilder.set.mock.calls[0][0] as Record<string, unknown>
    expect(set.pendingSwapProposedBy).toBeNull()
    expect(set.pendingSwapExpiresAt).toBeNull()
  })

  it('clears pending fields when the other party rejects', async () => {
    setMockUser(VIEWER_B)
    queueDbResult([duoGroup({
      pendingSwapProposedBy: 'user-a',
      pendingSwapExpiresAt: new Date('2099-01-01'),
    })])
    await cancelSwap()
    const set = mockBuilder.set.mock.calls[0][0] as Record<string, unknown>
    expect(set.pendingSwapProposedBy).toBeNull()
  })

  it('rejects when there is nothing to cancel', async () => {
    setMockUser(VIEWER_A)
    queueDbResult([duoGroup()])
    expect(await cancelSwap()).toEqual({ ok: false, code: 'no_pending_swap' })
  })
})

// ─── confirmSwap ─────────────────────────────────────────────────────────────

describe('confirmSwap', () => {
  it('happy path: partner confirms — swaps members, recalcs balance', async () => {
    setMockUser(VIEWER_B)
    queueDbResult([duoGroup({
      pendingSwapProposedBy: 'user-a',
      pendingSwapExpiresAt: new Date('2099-01-01'),
    })])
    await confirmSwap()
    expect(mockDb.transaction).toHaveBeenCalledOnce()
    const set = mockBuilder.set.mock.calls[0][0] as Record<string, unknown>
    expect(set.memberA).toBe('user-b')
    expect(set.memberB).toBe('user-a')
    expect(set.pendingSwapProposedBy).toBeNull()
  })

  it('also flips default_split_ratio_a when set', async () => {
    setMockUser(VIEWER_B)
    queueDbResult([duoGroup({
      pendingSwapProposedBy: 'user-a',
      pendingSwapExpiresAt: new Date('2099-01-01'),
      defaultSplitRatioA: 70,
    })])
    await confirmSwap()
    // First .set is the member swap; second .set is the ratio flip
    const ratioSet = mockBuilder.set.mock.calls[1][0] as Record<string, unknown>
    expect(ratioSet.defaultSplitRatioA).toBe(30)
  })

  it('rejects when proposer tries to confirm their own proposal', async () => {
    setMockUser(VIEWER_A)
    queueDbResult([duoGroup({
      pendingSwapProposedBy: 'user-a',
      pendingSwapExpiresAt: new Date('2099-01-01'),
    })])
    expect(await confirmSwap()).toEqual({ ok: false, code: 'cannot_confirm_own_proposal' })
  })

  it('rejects when no swap is pending', async () => {
    setMockUser(VIEWER_B)
    queueDbResult([duoGroup()])
    expect(await confirmSwap()).toEqual({ ok: false, code: 'no_pending_swap' })
  })

  it('rejects an expired proposal', async () => {
    setMockUser(VIEWER_B)
    queueDbResult([duoGroup({
      pendingSwapProposedBy: 'user-a',
      pendingSwapExpiresAt: new Date('2000-01-01'),
    })])
    expect(await confirmSwap()).toEqual({ ok: false, code: 'swap_expired' })
  })
})

// ─── leaveGroup ──────────────────────────────────────────────────────────────

describe('leaveGroup', () => {
  it('happy path: member_b leaves with balance = 0', async () => {
    setMockUser(VIEWER_B)
    queueDbResult([duoGroup()])                          // group lookup
    // Inside the transaction — locks and the boundary first, then the guards (#943 S-E, #1290):
    queueDbResult([{ memberA: 'user-a', memberB: 'user-b' }]) // OikosGroups … FOR NO KEY UPDATE
    queueDbResult([{ id: 'epoch-1', memberAId: 'user-a', memberBId: 'user-b' }]) // open GroupEpochs … FOR NO KEY UPDATE
    queueDbResult([{ boundary: '2026-09-27 00:00:00.123456+00' }])   // clock_timestamp() → execute()
    queueDbResult([{ balance: 0 }])                      // getGroupBalance(groupId, tx) → execute()
    queueDbResult([{ n: 0 }])                            // hasActiveTrip (.then)
    queueDbResult([{ n: 0 }])                            // hasActiveOuting (.then)
    queueDbResult([{ id: 'grp-new' }])                   // insert new group .returning
    queueDbResult([])                                    // groupBalance insert (await → .then)
    queueDbResult([{ id: 'epoch-new' }])                 // insert leaver's solo epoch .returning
    // Moving 愛物 are decided under the lock (#1442), after the new group exists.
    queueDbResult([])                                    // movingHouse rows
    queueDbResult([])                                    // movingCar rows
    queueDbResult([])                                    // movingInsurance rows

    const r = await leaveGroup()
    // epochId is what LeaveGroupFlow keys `futari_just_left_` off so
    // WelcomeSoloCard reads the same key space as PartnerLeftCard (#1125).
    expect(r).toEqual({ ok: true, data: { groupId: 'grp-new', epochId: 'epoch-new' } })
    expect(mockDb.transaction).toHaveBeenCalledOnce()
    expect(mockBuilder.for).toHaveBeenCalledWith('no key update')
    expect(mockBuilder.for).not.toHaveBeenCalledWith('update')
    // Every chapter stamp is the one DB-clock boundary, never a JS Date.
    expect(mockBuilder.values.mock.calls[0][0].currentEpochStartedAt).toBeInstanceOf(SQL)

    // New solo group gets the neutral default, never a display name (#1622).
    // No cookie -> DEFAULT_LOCALE (zh-TW).
    const insertedGroup = (mockBuilder.values.mock.calls[0][0]) as Record<string, unknown>
    expect(insertedGroup.name).toBe('家計簿')
    expect(insertedGroup.memberA).toBe('user-b')
    expect(insertedGroup.memberB).toBeNull()
  })

  // #1442 replaced the #1440 `asset_id = CASE …` on moving rows: rows move
  // with their links untouched, and every link left crossing into the other
  // ledger is re-pointed at a frozen copy afterwards (freezeCrossLedgerLinks;
  // real-DB coverage in __tests__/actions/leaveGroup.frozenAssetCopy.test.ts).
  // The mocked db doesn't parse SQL, so assert on the generated query via the
  // real PgDialect: no moving UPDATE writes asset_id, the moving-asset ids are
  // read under the lock, and no JS array is ever bound as one param (#1440).
  it('moves rows without NULLing asset links; cross-ledger links go to the frozen-copy step (#1442)', async () => {
    setMockUser(VIEWER_B)
    queueDbResult([duoGroup()])
    queueDbResult([{ memberA: 'user-a', memberB: 'user-b' }])
    queueDbResult([{ id: 'epoch-1', memberAId: 'user-a', memberBId: 'user-b' }])
    queueDbResult([{ boundary: '2026-09-27 00:00:00.123456+00' }])
    queueDbResult([{ balance: 0 }])
    queueDbResult([{ n: 0 }])
    queueDbResult([{ n: 0 }])
    queueDbResult([{ id: 'grp-new' }])
    queueDbResult([])
    queueDbResult([{ id: 'epoch-new' }])
    queueDbResult([])                                    // movingHouse rows
    queueDbResult([{ assetId: 'car-1' }, { assetId: 'car-2' }]) // movingCar rows (2 ids)
    queueDbResult([])                                    // movingInsurance rows

    expect(await leaveGroup()).toEqual({ ok: true, data: { groupId: 'grp-new', epochId: 'epoch-new' } })

    const dialect = new PgDialect()
    const queries = (mockDb.execute.mock.calls as unknown as [SQL][]).map(([arg]) => dialect.sqlToQuery(arg))
    const moves = queries.filter((q) => /UPDATE "(CashTransactions|IncomeTransactions|RecurringExpenseRules|RecurringIncomeRules)"\s+SET group_id/.test(q.sql))
    expect(moves).toHaveLength(4)
    for (const q of moves) expect(q.sql).not.toContain('asset_id')

    const freeze = queries.find((q) => q.sql.includes('WITH g(row_group, other_group)'))
    if (!freeze) throw new Error('frozen-copy pair query not found among mockDb.execute calls')
    expect(freeze.params).toEqual(expect.arrayContaining(['grp-1', 'grp-new']))
    for (const q of queries) {
      expect(q.sql).not.toContain('ANY(')
      for (const p of q.params) expect(Array.isArray(p)).toBe(false)
    }
  })

  it('rejects when balance is not 0 — read inside the transaction, after the group-row lock', async () => {
    setMockUser(VIEWER_B)
    queueDbResult([duoGroup()])
    queueDbResult([{ memberA: 'user-a', memberB: 'user-b' }]) // group-row lock
    queueDbResult([{ id: 'epoch-1', memberAId: 'user-a', memberBId: 'user-b' }]) // chapter-row lock
    queueDbResult([{ boundary: '2026-09-27 00:00:00.123456+00' }])   // boundary
    queueDbResult([{ balance: 500 }])
    expect(await leaveGroup()).toEqual({ ok: false, code: 'balance_not_zero' })
    // The check ran inside the tx (so an endOuting Settlement committed before
    // the lock is seen) and nothing was written.
    expect(mockDb.transaction).toHaveBeenCalledOnce()
    expect(mockBuilder.for).toHaveBeenCalledWith('no key update')
    expect(mockBuilder.for).not.toHaveBeenCalledWith('update')
    expect(mockDb.execute).toHaveBeenCalledTimes(2) // boundary, then balance
    expect(mockBuilder.values).not.toHaveBeenCalled()
  })

  it('rejects when an outing is active in the current epoch (#943)', async () => {
    setMockUser(VIEWER_B)
    queueDbResult([duoGroup()])
    queueDbResult([{ memberA: 'user-a', memberB: 'user-b' }]) // group-row lock
    queueDbResult([{ id: 'epoch-1', memberAId: 'user-a', memberBId: 'user-b' }]) // chapter-row lock
    queueDbResult([{ boundary: '2026-09-27 00:00:00.123456+00' }])   // boundary
    queueDbResult([{ balance: 0 }])
    queueDbResult([{ n: 0 }])                            // no active trip
    queueDbResult([{ n: 1 }])                            // active outing
    expect(await leaveGroup()).toEqual({ ok: false, code: 'leave_active_outing' })
    expect(mockBuilder.values).not.toHaveBeenCalled()
  })

  it('rejects when an active trip exists (checked before the outing fence)', async () => {
    setMockUser(VIEWER_B)
    queueDbResult([duoGroup()])
    queueDbResult([{ memberA: 'user-a', memberB: 'user-b' }]) // group-row lock
    queueDbResult([{ id: 'epoch-1', memberAId: 'user-a', memberBId: 'user-b' }]) // chapter-row lock
    queueDbResult([{ boundary: '2026-09-27 00:00:00.123456+00' }])   // boundary
    queueDbResult([{ balance: 0 }])
    queueDbResult([{ n: 1 }])                            // active trip
    expect(await leaveGroup()).toEqual({ ok: false, code: 'leave_active_trip' })
  })

  it('re-checks membership under the lock: a concurrent change makes the leave stale', async () => {
    setMockUser(VIEWER_B)
    queueDbResult([duoGroup()])
    queueDbResult([{ memberA: 'user-a', memberB: null }]) // partner row changed before we got the lock
    queueDbResult([{ id: 'epoch-1', memberAId: 'user-a', memberBId: null }])
    queueDbResult([{ boundary: '2026-09-27 00:00:00.123456+00' }])
    expect(await leaveGroup()).toEqual({ ok: false, code: 'only_member_b_can_leave' })
    expect(mockBuilder.values).not.toHaveBeenCalled()
  })

  it('rejects when caller is member_a (must swap first)', async () => {
    setMockUser(VIEWER_A)
    queueDbResult([duoGroup()])
    expect(await leaveGroup()).toEqual({ ok: false, code: 'only_member_b_can_leave' })
  })

  it('rejects in a solo group', async () => {
    setMockUser(VIEWER_A)
    queueDbResult([duoGroup({ memberB: null })])
    expect(await leaveGroup()).toEqual({ ok: false, code: 'solo_group' })
  })

  it('throws unauthorized with no user', async () => {
    setMockUser(null)
    await expect(leaveGroup()).rejects.toThrow('Unauthorized')
  })

  // #1622: a ledger name outlives the person's account deletion and can be
  // shown to a later partner, so it must never carry a display name. The old
  // code named it "<displayName> 的家計簿" from a pre-transaction Profiles read.
  function queueHappyLeave() {
    queueDbResult([duoGroup()])
    queueDbResult([{ memberA: 'user-a', memberB: 'user-b' }]) // group-row lock
    queueDbResult([{ id: 'epoch-1', memberAId: 'user-a', memberBId: 'user-b' }]) // chapter-row lock
    queueDbResult([{ boundary: '2026-09-27 00:00:00.123456+00' }])   // boundary
    queueDbResult([{ balance: 0 }])
    queueDbResult([{ n: 0 }])                            // no active trip
    queueDbResult([{ n: 0 }])                            // no active outing
    queueDbResult([{ id: 'grp-new' }])
    queueDbResult([])
    queueDbResult([{ id: 'epoch-new' }])
    queueDbResult([])
    queueDbResult([])
    queueDbResult([])
  }

  it.each(SUPPORTED_LOCALES)('names the new solo ledger with the neutral %s default, never a display name (#1622)', async (locale) => {
    setMockUser(VIEWER_B)
    cookieStore.set(LOCALE_COOKIE, locale)
    queueHappyLeave()

    expect(await leaveGroup()).toEqual({ ok: true, data: { groupId: 'grp-new', epochId: 'epoch-new' } })
    const insertedGroup = (mockBuilder.values.mock.calls[0][0]) as Record<string, unknown>
    expect(insertedGroup.name).toBe(dictionaries[locale].postLeave.newLedgerName)
    expect(insertedGroup.name).toBe(({ 'zh-TW': '家計簿', 'zh-CN': '家计簿', en: 'Household ledger', ja: '家計簿' } as const)[locale])
  })

  it('never reads Profiles to name the ledger (no pre-transaction display-name lookup, #1622)', async () => {
    setMockUser(VIEWER_B)
    queueHappyLeave()
    expect(await leaveGroup()).toEqual({ ok: true, data: { groupId: 'grp-new', epochId: 'epoch-new' } })
    // The first queued result after the group lookup is the group-row lock:
    // had a Profiles read been reinstated it would consume it and the leave
    // would fail the membership re-check instead of succeeding.
    const insertedGroup = (mockBuilder.values.mock.calls[0][0]) as Record<string, unknown>
    expect(insertedGroup.name).toBe('家計簿')
    expect(String(insertedGroup.name)).not.toContain(' 的家計簿')
  })
})

// ─── removePartner ───────────────────────────────────────────────────────────

describe('removePartner', () => {
  it('happy path: member_a removes member_b — closes epoch, opens solo epoch, clears member_b', async () => {
    setMockUser(VIEWER_A)
    queueDbResult([duoGroup()])            // group lookup
    // Inside the transaction — locks and the boundary, then the fences (#943 S-E, #1290):
    queueDbResult([{ memberA: 'user-a', memberB: 'user-b' }])  // OikosGroups … FOR NO KEY UPDATE
    queueDbResult([{ id: 'epoch-1', memberAId: 'user-a', memberBId: 'user-b' }]) // open GroupEpochs … FOR NO KEY UPDATE
    queueDbResult([{ boundary: '2026-09-27 00:00:00.123456+00' }]) // clock_timestamp()
    queueDbResult([{ n: 0 }])              // hasActiveTrip (.then)
    queueDbResult([{ n: 0 }])              // hasActiveOuting (.then)
    queueDbResult([])                      // tx: invite revocation (.then)
    queueDbResult([])                      // tx: close old epoch (.then)
    queueDbResult([{ id: 'epoch-2' }])     // tx: insert new solo epoch (.returning)

    const r = await removePartner()
    // epochId is what RemovePartnerFlow keys its "I removed them" flag off, so
    // PartnerLeftCard can pick the removal variant (#1121).
    expect(r).toEqual({ ok: true, data: { groupId: 'grp-1', epochId: 'epoch-2' } })
    expect(mockDb.transaction).toHaveBeenCalledOnce()

    // First .set() inside the tx is the invite revocation
    const inviteSet = mockBuilder.set.mock.calls[0][0] as Record<string, unknown>
    expect(inviteSet.revokedAt).toBeInstanceOf(SQL)

    // Second .set() closes the old epoch (endedAt)
    const epochCloseSet = mockBuilder.set.mock.calls[1][0] as Record<string, unknown>
    expect(epochCloseSet.endedAt).toBeInstanceOf(SQL)

    // The new epoch row inserted for member_a, solo
    const insertedEpoch = mockBuilder.values.mock.calls[0][0] as Record<string, unknown>
    expect(insertedEpoch.memberAId).toBe('user-a')
    expect(insertedEpoch.memberBId).toBeNull()

    // Group is cleared back to solo
    const groupSet = mockBuilder.set.mock.calls[2][0] as Record<string, unknown>
    expect(groupSet.memberB).toBeNull()
    expect(groupSet.pendingSwapProposedBy).toBeNull()
  })

  it('rejects when caller is member_b (only member_a can remove)', async () => {
    setMockUser(VIEWER_B)
    queueDbResult([duoGroup()])
    expect(await removePartner()).toEqual({ ok: false, code: 'only_member_a_can_remove' })
  })

  it('rejects in a solo group', async () => {
    setMockUser(VIEWER_A)
    queueDbResult([duoGroup({ memberB: null })])
    expect(await removePartner()).toEqual({ ok: false, code: 'solo_group' })
  })

  it('rejects when there is an active trip in the current epoch', async () => {
    setMockUser(VIEWER_A)
    queueDbResult([duoGroup()])
    queueDbResult([{ memberA: 'user-a', memberB: 'user-b' }])
    queueDbResult([{ id: 'epoch-1', memberAId: 'user-a', memberBId: 'user-b' }])
    queueDbResult([{ boundary: '2026-09-27 00:00:00.123456+00' }])
    queueDbResult([{ n: 1 }])              // hasActiveTrip → true
    expect(await removePartner()).toEqual({ ok: false, code: 'active_trip' })
    expect(mockDb.transaction).toHaveBeenCalledOnce()
    expect(mockBuilder.set).not.toHaveBeenCalled()
  })

  it('rejects when an outing is active in the current epoch (#943)', async () => {
    setMockUser(VIEWER_A)
    queueDbResult([duoGroup()])
    queueDbResult([{ memberA: 'user-a', memberB: 'user-b' }])
    queueDbResult([{ id: 'epoch-1', memberAId: 'user-a', memberBId: 'user-b' }])
    queueDbResult([{ boundary: '2026-09-27 00:00:00.123456+00' }])
    queueDbResult([{ n: 0 }])              // no active trip
    queueDbResult([{ n: 1 }])              // hasActiveOuting → true
    expect(await removePartner()).toEqual({ ok: false, code: 'active_outing' })
    expect(mockBuilder.set).not.toHaveBeenCalled()
  })

  it('throws unauthorized with no user', async () => {
    setMockUser(null)
    await expect(removePartner()).rejects.toThrow('Unauthorized')
  })

  it('throws when no group is found', async () => {
    setMockUser(VIEWER_A)
    queueDbResult([])
    await expect(removePartner()).rejects.toThrow('找不到家計簿')
  })
})
