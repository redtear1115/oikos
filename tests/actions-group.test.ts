import { describe, it, expect, beforeEach } from 'vitest'
import { setMockUser } from './_mocks/supabase'
import { mockDb, queueDbResult, resetDbMocks } from './_mocks/db'
import { createGroup, updateGroupName } from '@/actions/group'
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

  it('throws if user already in a group', async () => {
    queueDbResult([{ id: 'existing-grp' }])
    await expect(createGroup('新家')).rejects.toThrow('Already in a group')
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
