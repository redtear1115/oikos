import { describe, it, expect, beforeEach } from 'vitest'
import { setMockUser } from './_mocks/supabase'
import { mockDb, mockBuilder, queueDbResult, resetDbMocks } from './_mocks/db'
import { createGroup, updateGroupName, toggleGuardianBeta } from '@/actions/group'
import { updateDisplayName, updateDefaultSplitType } from '@/actions/profile'

const VIEWER = { id: 'user-a', email: 'a@example.com' }

beforeEach(() => {
  resetDbMocks()
  setMockUser(VIEWER)
})

describe('createGroup', () => {
  it('happy path: creates group + balance row', async () => {
    queueDbResult([])  // existing-group lookup → none
    queueDbResult([{ id: 'grp-new', name: '我們家', memberA: 'user-a', memberB: null }])  // insert returning
    // groupBalance insert (no returning) — gets [] from empty queue (default)

    const g = await createGroup('我們家')
    expect(g.id).toBe('grp-new')
    expect(mockDb.transaction).toHaveBeenCalledOnce()
  })

  it('opens the initial GroupEpochs row (#946 — solo trips 500)', async () => {
    // Every group must have exactly one open epoch (endedAt IS NULL); the
    // 0030 backfill established this for existing groups, but createGroup
    // never opened the row for *new* solo groups — so /trips (and trip
    // creation) threw '找不到當前章節' in solo mode. The open epoch must be
    // created here, mirroring the backfill: started_at = currentEpochStartedAt,
    // member_b_id = null for solo.
    const startedAt = new Date('2026-06-30T00:00:00Z')
    queueDbResult([])  // existing-group lookup → none
    queueDbResult([{ id: 'grp-new', name: '我們家', memberA: 'user-a', memberB: null, currentEpochStartedAt: startedAt }])

    await createGroup('我們家')

    const epochInsert = mockBuilder.values.mock.calls
      .map((c) => c[0] as Record<string, unknown>)
      .find((payload) => 'memberAId' in payload)
    expect(epochInsert).toBeDefined()
    expect(epochInsert).toMatchObject({
      groupId: 'grp-new',
      memberAId: 'user-a',
      memberBId: null,
      startedAt,
    })
  })

  it('idempotent: returns existing group instead of creating a second one', async () => {
    // #911: a user already in a group who re-enters createGroup (cross-tab
    // race, retry, double-submit) gets their existing group back — no throw,
    // no second insert, no duplicate setup_completed.
    queueDbResult([{ id: 'existing-grp' }])
    const g = await createGroup('新家')
    expect(g.id).toBe('existing-grp')
    expect(mockDb.transaction).not.toHaveBeenCalled()
  })

  it('throws unauthorized when no user', async () => {
    setMockUser(null)
    await expect(createGroup('新家')).rejects.toThrow('Unauthorized')
  })
})

describe('updateGroupName', () => {
  it('happy path', async () => {
    queueDbResult([{ id: 'grp-1' }])  // update returning
    const r = await updateGroupName('  新名稱 ')
    expect(r).toEqual({ ok: true })
  })

  it('rejects empty', async () => {
    await expect(updateGroupName('   ')).rejects.toThrow(/帳本名稱不能為空/)
  })

  it('rejects too long', async () => {
    await expect(updateGroupName('x'.repeat(33))).rejects.toThrow(/帳本名稱最長 32 字/)
  })

  it('throws if no group found', async () => {
    queueDbResult([])
    await expect(updateGroupName('OK')).rejects.toThrow('找不到家計簿')
  })

  it('throws unauthorized when no user', async () => {
    setMockUser(null)
    await expect(updateGroupName('新名稱')).rejects.toThrow('Unauthorized')
  })
})

describe('updateDisplayName', () => {
  it('happy path', async () => {
    queueDbResult([{ id: 'user-a' }])
    const r = await updateDisplayName(' Coco ')
    expect(r).toEqual({ ok: true })
  })

  it('rejects empty', async () => {
    await expect(updateDisplayName('  ')).rejects.toThrow(/顯示名稱不能為空/)
  })

  it('rejects too long', async () => {
    await expect(updateDisplayName('x'.repeat(33))).rejects.toThrow(/顯示名稱最長 32 字/)
  })

  it('throws if profile not found', async () => {
    queueDbResult([])
    await expect(updateDisplayName('Coco')).rejects.toThrow('找不到個人資料')
  })

  it('throws unauthorized when no user', async () => {
    setMockUser(null)
    await expect(updateDisplayName('Coco')).rejects.toThrow('Unauthorized')
  })
})

describe('updateDefaultSplitType', () => {
  it('happy path: half', async () => {
    queueDbResult([{ id: 'user-a' }])  // update returning
    const r = await updateDefaultSplitType('half')
    expect(r).toEqual({ ok: true })
  })

  it('happy path: all_mine', async () => {
    queueDbResult([{ id: 'user-a' }])
    const r = await updateDefaultSplitType('all_mine')
    expect(r).toEqual({ ok: true })
  })

  it('happy path: all_theirs', async () => {
    queueDbResult([{ id: 'user-a' }])
    const r = await updateDefaultSplitType('all_theirs')
    expect(r).toEqual({ ok: true })
  })

  it('rejects invalid split type', async () => {
    // @ts-expect-error testing runtime validation
    await expect(updateDefaultSplitType('invalid')).rejects.toThrow(/分攤方式無效/)
  })

  it('throws if profile not found', async () => {
    queueDbResult([])  // update returning nothing
    await expect(updateDefaultSplitType('half')).rejects.toThrow('找不到個人資料')
  })

  it('throws unauthorized when no user', async () => {
    setMockUser(null)
    await expect(updateDefaultSplitType('half')).rejects.toThrow('Unauthorized')
  })
})

describe('toggleGuardianBeta (#220)', () => {
  it('writes the requested boolean to OikosGroups.guardianBetaEnabled', async () => {
    const { mockBuilder } = await import('./_mocks/db')
    queueDbResult([{ id: 'grp-1', guardianBetaEnabled: false }])
    const r = await toggleGuardianBeta(true)
    expect(r).toEqual({ ok: true })
    const setPayload = mockBuilder.set.mock.calls[0][0] as Record<string, unknown>
    expect(setPayload.guardianBetaEnabled).toBe(true)
  })

  it('also accepts a false value (turning the flag off)', async () => {
    const { mockBuilder } = await import('./_mocks/db')
    queueDbResult([{ id: 'grp-1', guardianBetaEnabled: true }])
    await toggleGuardianBeta(false)
    const setPayload = mockBuilder.set.mock.calls[0][0] as Record<string, unknown>
    expect(setPayload.guardianBetaEnabled).toBe(false)
  })

  it('throws unauthorized when no user', async () => {
    setMockUser(null)
    await expect(toggleGuardianBeta(true)).rejects.toThrow('Unauthorized')
  })

  it('throws when group not found', async () => {
    queueDbResult([])
    await expect(toggleGuardianBeta(true)).rejects.toThrow('找不到家計簿')
  })
})
