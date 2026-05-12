import { describe, it, expect, beforeEach, vi } from 'vitest'
import './_mocks/supabase'
import { setMockUser } from './_mocks/supabase'
import { mockDb, queueDbResult, resetDbMocks } from './_mocks/db'

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

import { getViewerWriteContext } from '@/lib/actionContext'
import { PAST_EPOCH_COOKIE } from '@/lib/db/queries/epoch'

const VIEWER = { id: 'user-a', email: 'a@example.com' }
const GROUP = {
  id: 'grp-1',
  memberA: 'user-a',
  memberB: 'user-b',
  name: '我們家',
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
const CLOSED_EPOCH = {
  id: 'epoch-old',
  groupId: 'grp-1',
  startedAt: new Date('2025-01-01T00:00:00Z'),
  endedAt: new Date('2025-12-31T23:59:59Z'),
  memberAId: 'user-a',
  memberBId: 'user-b',
}

beforeEach(() => {
  resetDbMocks()
  setMockUser(VIEWER)
  cookieStore.clear()
})

describe('getViewerWriteContext', () => {
  it('returns user + group when no past-epoch pin (current epoch path)', async () => {
    queueDbResult([GROUP])         // getActiveGroupForUser
    queueDbResult([OPEN_EPOCH])    // current epoch lookup

    const ctx = await getViewerWriteContext()
    expect(ctx.user.id).toBe('user-a')
    expect(ctx.group.id).toBe('grp-1')
  })

  it('throws 過去章節不可編輯 when pinned to a past epoch', async () => {
    setCookie(PAST_EPOCH_COOKIE, 'epoch-old')
    queueDbResult([CLOSED_EPOCH])  // pinned epoch lookup
    queueDbResult([GROUP])         // group lookup for pinned epoch

    await expect(getViewerWriteContext()).rejects.toThrow('過去章節不可編輯')
  })

  it('throws Unauthorized when no user', async () => {
    setMockUser(null)
    await expect(getViewerWriteContext()).rejects.toThrow('Unauthorized')
  })

  it('throws 找不到家計簿 when user has no group and no pin', async () => {
    queueDbResult([])  // getActiveGroupForUser returns null
    await expect(getViewerWriteContext()).rejects.toThrow('找不到家計簿')
  })
})
