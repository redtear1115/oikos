import { describe, it, expect, beforeEach } from 'vitest'
import { setMockUser } from './_mocks/supabase'
import { mockDb, mockBuilder, queueDbResult, resetDbMocks } from './_mocks/db'
import {
  proposeSwap,
  cancelSwap,
  confirmSwap,
  leaveGroup,
} from '@/actions/membership'

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
    await expect(proposeSwap()).rejects.toThrow('swap_already_pending')
  })

  it('rejects in a solo group (memberB null)', async () => {
    setMockUser(VIEWER_A)
    queueDbResult([duoGroup({ memberB: null })])
    await expect(proposeSwap()).rejects.toThrow('solo_group')
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
    await expect(cancelSwap()).rejects.toThrow('no_pending_swap')
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
    await expect(confirmSwap()).rejects.toThrow('cannot_confirm_own_proposal')
  })

  it('rejects when no swap is pending', async () => {
    setMockUser(VIEWER_B)
    queueDbResult([duoGroup()])
    await expect(confirmSwap()).rejects.toThrow('no_pending_swap')
  })

  it('rejects an expired proposal', async () => {
    setMockUser(VIEWER_B)
    queueDbResult([duoGroup({
      pendingSwapProposedBy: 'user-a',
      pendingSwapExpiresAt: new Date('2000-01-01'),
    })])
    await expect(confirmSwap()).rejects.toThrow('swap_expired')
  })
})

// ─── leaveGroup ──────────────────────────────────────────────────────────────

describe('leaveGroup', () => {
  it('happy path: member_b leaves with balance = 0', async () => {
    setMockUser(VIEWER_B)
    queueDbResult([duoGroup()])                          // group lookup
    // getGroupBalance — first execute() call: returns [{ balance: 0 }]
    queueDbResult([{ balance: 0 }])
    queueDbResult([{ id: 'epoch-1' }])                   // active-trip guard: currentEpoch (.limit)
    queueDbResult([{ n: 0 }])                            // active-trip guard: hasActiveTrip count (.then)
    queueDbResult([{ displayName: 'Mei' }])              // leaver profile
    queueDbResult([])                                    // movingHouse rows
    queueDbResult([])                                    // movingCar rows
    queueDbResult([])                                    // movingInsurance rows
    // Inside the transaction:
    queueDbResult([{ id: 'grp-new' }])                   // insert new group .returning
    // groupBalance insert (no returning) — empty queue is fine

    const r = await leaveGroup()
    expect(r).toEqual({ groupId: 'grp-new' })
    expect(mockDb.transaction).toHaveBeenCalledOnce()

    // New solo group is named after the leaver's display name
    const insertedGroup = (mockBuilder.values.mock.calls[0][0]) as Record<string, unknown>
    expect(insertedGroup.name).toBe('Mei 的家計簿')
    expect(insertedGroup.memberA).toBe('user-b')
    expect(insertedGroup.memberB).toBeNull()
  })

  it('rejects when balance is not 0', async () => {
    setMockUser(VIEWER_B)
    queueDbResult([duoGroup()])
    queueDbResult([{ balance: 500 }])
    await expect(leaveGroup()).rejects.toThrow('balance_not_zero')
  })

  it('rejects when caller is member_a (must swap first)', async () => {
    setMockUser(VIEWER_A)
    queueDbResult([duoGroup()])
    await expect(leaveGroup()).rejects.toThrow('only_member_b_can_leave')
  })

  it('rejects in a solo group', async () => {
    setMockUser(VIEWER_A)
    queueDbResult([duoGroup({ memberB: null })])
    await expect(leaveGroup()).rejects.toThrow('solo_group')
  })

  it('throws unauthorized with no user', async () => {
    setMockUser(null)
    await expect(leaveGroup()).rejects.toThrow('Unauthorized')
  })

  it('falls back to a generic group name when profile is missing', async () => {
    setMockUser(VIEWER_B)
    queueDbResult([duoGroup()])
    queueDbResult([{ balance: 0 }])
    queueDbResult([{ id: 'epoch-1' }])                   // active-trip guard: currentEpoch (.limit)
    queueDbResult([{ n: 0 }])                            // active-trip guard: hasActiveTrip count (.then)
    queueDbResult([])                                    // no profile row
    queueDbResult([])                                    // no house
    queueDbResult([])                                    // no car
    queueDbResult([])                                    // no insurance
    queueDbResult([{ id: 'grp-new' }])

    await leaveGroup()
    const insertedGroup = (mockBuilder.values.mock.calls[0][0]) as Record<string, unknown>
    expect(insertedGroup.name).toBe('我的家計簿')
  })
})
