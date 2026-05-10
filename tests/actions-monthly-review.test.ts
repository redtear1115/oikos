import { describe, it, expect, beforeEach } from 'vitest'
import { setMockUser } from './_mocks/supabase'
import { mockBuilder, queueDbResult, resetDbMocks } from './_mocks/db'
import {
  upsertMonthlyReviewMessage,
  dismissMonthlyReviewBanner,
} from '@/actions/monthlyReview'

const VIEWER = { id: 'user-a', email: 'a@example.com' }
const GROUP = { id: 'grp-1', memberA: 'user-a', memberB: 'user-b', name: '我們家' }
const SOLO_GROUP = { ...GROUP, memberB: null }

beforeEach(() => {
  resetDbMocks()
  setMockUser(VIEWER)
})

describe('upsertMonthlyReviewMessage', () => {
  it('inserts a fresh message when none exists', async () => {
    queueDbResult([GROUP])     // getViewerGroup → group lookup
    queueDbResult([])          // existing message lookup → none
    queueDbResult([{ id: 'msg-1' }]) // insert returning

    const out = await upsertMonthlyReviewMessage({
      year: 2026, month: 6, body: '下個月想一起去看海',
    })

    expect(out).toEqual({ id: 'msg-1' })
    const insertedValues = mockBuilder.values.mock.calls[0][0] as Record<string, unknown>
    expect(insertedValues.groupId).toBe(GROUP.id)
    expect(insertedValues.memberId).toBe(VIEWER.id)
    expect(insertedValues.year).toBe(2026)
    expect(insertedValues.month).toBe(6)
    expect(insertedValues.body).toBe('下個月想一起去看海')
  })

  it('updates an existing un-locked message', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'msg-existing', lockedAt: null }])
    queueDbResult([{ id: 'msg-existing' }])

    const out = await upsertMonthlyReviewMessage({
      year: 2026, month: 6, body: '改一下',
    })

    expect(out).toEqual({ id: 'msg-existing' })
    const setPayload = mockBuilder.set.mock.calls[0][0] as Record<string, unknown>
    expect(setPayload.body).toBe('改一下')
    expect(setPayload.updatedAt).toBeInstanceOf(Date)
  })

  it('refuses to update when locked_at is set', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'msg-existing', lockedAt: new Date() }])

    await expect(upsertMonthlyReviewMessage({
      year: 2026, month: 6, body: '想改但鎖了',
    })).rejects.toThrow(/鎖定/)
  })

  it('rejects empty body before touching the DB', async () => {
    // No queue: getViewerGroup is *not* expected to fire because validation
    // runs first.
    await expect(upsertMonthlyReviewMessage({
      year: 2026, month: 6, body: '   ',
    })).rejects.toThrow(/不能為空/)
  })

  it('rejects body over 200 codepoints', async () => {
    const tooLong = '字'.repeat(201)
    await expect(upsertMonthlyReviewMessage({
      year: 2026, month: 6, body: tooLong,
    })).rejects.toThrow(/最長/)
  })

  it('handles solo mode (memberB null) without complaint', async () => {
    queueDbResult([SOLO_GROUP])
    queueDbResult([])
    queueDbResult([{ id: 'msg-solo' }])

    const out = await upsertMonthlyReviewMessage({
      year: 2026, month: 6, body: '一個人也要好好過',
    })
    expect(out).toEqual({ id: 'msg-solo' })
  })
})

describe('dismissMonthlyReviewBanner', () => {
  it('sets memberA dismiss flag for member A viewer', async () => {
    queueDbResult([GROUP])
    queueDbResult([])  // update().where(...).then resolves to []

    await dismissMonthlyReviewBanner({ year: 2026, month: 5 })

    const setPayload = mockBuilder.set.mock.calls[0][0] as Record<string, unknown>
    expect(setPayload.bannerDismissedByMemberAAt).toBeInstanceOf(Date)
    expect(setPayload.bannerDismissedByMemberBAt).toBeUndefined()
  })

  it('sets memberB dismiss flag for member B viewer', async () => {
    setMockUser({ id: 'user-b' })
    queueDbResult([GROUP])
    queueDbResult([])

    await dismissMonthlyReviewBanner({ year: 2026, month: 5 })

    const setPayload = mockBuilder.set.mock.calls[0][0] as Record<string, unknown>
    expect(setPayload.bannerDismissedByMemberBAt).toBeInstanceOf(Date)
    expect(setPayload.bannerDismissedByMemberAAt).toBeUndefined()
  })
})
