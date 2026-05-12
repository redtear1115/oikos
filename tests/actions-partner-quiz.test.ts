import { describe, it, expect, beforeEach } from 'vitest'
import { setMockUser } from './_mocks/supabase'
import { mockBuilder, mockDb, queueDbResult, resetDbMocks } from './_mocks/db'
import {
  startPartnerQuizSession,
  submitPartnerQuizAnswers,
} from '@/actions/partnerQuiz'

const VIEWER = { id: 'user-a', email: 'a@example.com' }
const GROUP = { id: 'grp-1', memberA: 'user-a', memberB: 'user-b', name: '我們家' }
const SOLO_GROUP = { ...GROUP, memberB: null }
const QUESTION_KEYS = ['impulse', 'risk', 'transparency']
const GOOD_ANSWERS = [
  { questionKey: 'impulse', choiceKey: 'a' },
  { questionKey: 'risk', choiceKey: 'b' },
  { questionKey: 'transparency', choiceKey: 'c' },
]

beforeEach(() => {
  resetDbMocks()
  setMockUser(VIEWER)
})

describe('startPartnerQuizSession', () => {
  it('returns the existing session when one already exists', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'sess-1', questionKeys: QUESTION_KEYS }])

    const out = await startPartnerQuizSession()
    expect(out).toEqual({
      sessionId: 'sess-1',
      questionKeys: QUESTION_KEYS,
      createdNew: false,
    })
  })

  it('creates a session with 3 random keys when none exists', async () => {
    queueDbResult([GROUP])
    queueDbResult([])                          // no existing
    queueDbResult([{ id: 'sess-new', questionKeys: ['big_purchase', 'future', 'recording_motive'] }])

    const out = await startPartnerQuizSession()
    expect(out.createdNew).toBe(true)
    expect(out.sessionId).toBe('sess-new')
    expect(out.questionKeys).toHaveLength(3)

    const insertedValues = mockBuilder.values.mock.calls[0][0] as Record<string, unknown>
    expect(insertedValues.groupId).toBe(GROUP.id)
    // Insert payload carries 3 distinct keys from the pool.
    const inserted = insertedValues.questionKeys as string[]
    expect(inserted).toHaveLength(3)
    expect(new Set(inserted).size).toBe(3)
  })

  it('refuses to start for a solo group', async () => {
    queueDbResult([SOLO_GROUP])
    await expect(startPartnerQuizSession()).rejects.toThrow(/一個人/)
  })
})

describe('submitPartnerQuizAnswers', () => {
  it('writes 3 answers and does NOT reveal when partner hasn’t answered', async () => {
    // getViewerGroup
    queueDbResult([GROUP])
    // session lookup
    queueDbResult([{
      id: 'sess-1',
      groupId: GROUP.id,
      questionKeys: QUESTION_KEYS,
      revealedAt: null,
    }])
    // transaction: existing-answers-for-self lookup → empty
    queueDbResult([])
    // transaction: insert .values(...) chain promise → []
    queueDbResult([])
    // transaction: allAnswers after insert — only viewer has 3 rows
    queueDbResult([
      { memberId: 'user-a' },
      { memberId: 'user-a' },
      { memberId: 'user-a' },
    ])

    const out = await submitPartnerQuizAnswers({
      sessionId: 'sess-1',
      answers: GOOD_ANSWERS,
    })
    expect(out).toEqual({ revealed: false })

    // We expect exactly one .insert() and zero .update() — reveal was NOT stamped.
    expect(mockDb.insert).toHaveBeenCalledTimes(1)
    expect(mockDb.update).not.toHaveBeenCalled()

    const insertedRows = mockBuilder.values.mock.calls[0][0] as Array<Record<string, unknown>>
    expect(insertedRows).toHaveLength(3)
    for (const row of insertedRows) {
      expect(row.sessionId).toBe('sess-1')
      expect(row.memberId).toBe(VIEWER.id)
    }
  })

  it('stamps revealed_at when partner is already done (atomic reveal)', async () => {
    queueDbResult([GROUP])
    queueDbResult([{
      id: 'sess-2',
      groupId: GROUP.id,
      questionKeys: QUESTION_KEYS,
      revealedAt: null,
    }])
    queueDbResult([])                                                // self has no answers yet
    queueDbResult([])                                                // insert chain
    // partner had already written 3 rows; insert just added 3 of ours.
    queueDbResult([
      { memberId: 'user-b' }, { memberId: 'user-b' }, { memberId: 'user-b' },
      { memberId: 'user-a' }, { memberId: 'user-a' }, { memberId: 'user-a' },
    ])
    queueDbResult([])  // the update chain promise

    const out = await submitPartnerQuizAnswers({
      sessionId: 'sess-2',
      answers: GOOD_ANSWERS,
    })
    expect(out).toEqual({ revealed: true })

    expect(mockDb.update).toHaveBeenCalledTimes(1)
    const setPayload = mockBuilder.set.mock.calls[0][0] as Record<string, unknown>
    expect(setPayload.revealedAt).toBeInstanceOf(Date)
  })

  it('refuses to re-submit when the viewer already has answers', async () => {
    queueDbResult([GROUP])
    queueDbResult([{
      id: 'sess-3',
      groupId: GROUP.id,
      questionKeys: QUESTION_KEYS,
      revealedAt: null,
    }])
    queueDbResult([{ id: 'ans-existing' }])  // existing-answers lookup non-empty

    await expect(submitPartnerQuizAnswers({
      sessionId: 'sess-3',
      answers: GOOD_ANSWERS,
    })).rejects.toThrow(/答完/)

    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it('refuses to write when the session belongs to a different group', async () => {
    queueDbResult([GROUP])
    queueDbResult([{
      id: 'sess-x',
      groupId: 'other-group',
      questionKeys: QUESTION_KEYS,
      revealedAt: null,
    }])

    await expect(submitPartnerQuizAnswers({
      sessionId: 'sess-x',
      answers: GOOD_ANSWERS,
    })).rejects.toThrow(/不屬於/)
  })

  it('refuses when the session is already revealed', async () => {
    queueDbResult([GROUP])
    queueDbResult([{
      id: 'sess-4',
      groupId: GROUP.id,
      questionKeys: QUESTION_KEYS,
      revealedAt: new Date(),
    }])

    await expect(submitPartnerQuizAnswers({
      sessionId: 'sess-4',
      answers: GOOD_ANSWERS,
    })).rejects.toThrow(/揭曉/)
  })

  it('rejects an answer set whose keys don’t match the session', async () => {
    queueDbResult([GROUP])
    queueDbResult([{
      id: 'sess-5',
      groupId: GROUP.id,
      questionKeys: QUESTION_KEYS,
      revealedAt: null,
    }])

    await expect(submitPartnerQuizAnswers({
      sessionId: 'sess-5',
      answers: [
        { questionKey: 'future', choiceKey: 'a' },
        { questionKey: 'risk', choiceKey: 'b' },
        { questionKey: 'transparency', choiceKey: 'c' },
      ],
    })).rejects.toThrow(/範圍/)
  })

  it('refuses in solo mode', async () => {
    queueDbResult([SOLO_GROUP])
    await expect(submitPartnerQuizAnswers({
      sessionId: 'sess-solo',
      answers: GOOD_ANSWERS,
    })).rejects.toThrow(/一個人/)
  })
})
