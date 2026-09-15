import { describe, it, expect, beforeEach } from 'vitest'
import { setMockUser } from './_mocks/supabase'
import { mockBuilder, mockDb, queueDbResult, resetDbMocks } from './_mocks/db'
import { submitPartnerQuizAnswers } from '@/actions/partnerQuiz'

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
    expect(out).toEqual({ ok: true, data: { revealed: false } })

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
    expect(out).toEqual({ ok: true, data: { revealed: true } })

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

    expect(await submitPartnerQuizAnswers({
      sessionId: 'sess-3',
      answers: GOOD_ANSWERS,
    })).toEqual({ ok: false, code: 'already_answered' })

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

    expect(await submitPartnerQuizAnswers({
      sessionId: 'sess-x',
      answers: GOOD_ANSWERS,
    })).toEqual({ ok: false, code: 'wrong_group' })
  })

  it('refuses when the session is already revealed', async () => {
    queueDbResult([GROUP])
    queueDbResult([{
      id: 'sess-4',
      groupId: GROUP.id,
      questionKeys: QUESTION_KEYS,
      revealedAt: new Date(),
    }])

    expect(await submitPartnerQuizAnswers({
      sessionId: 'sess-4',
      answers: GOOD_ANSWERS,
    })).toEqual({ ok: false, code: 'already_revealed' })
  })

  it('rejects an answer set whose keys don’t match the session', async () => {
    queueDbResult([GROUP])
    queueDbResult([{
      id: 'sess-5',
      groupId: GROUP.id,
      questionKeys: QUESTION_KEYS,
      revealedAt: null,
    }])

    expect(await submitPartnerQuizAnswers({
      sessionId: 'sess-5',
      answers: [
        { questionKey: 'future', choiceKey: 'a' },
        { questionKey: 'risk', choiceKey: 'b' },
        { questionKey: 'transparency', choiceKey: 'c' },
      ],
    })).toEqual({ ok: false, code: 'quiz_question_out_of_range' })
  })

  // #1123 / #1140 — QuestionCard renders whatever this action returns. A prose
  // message here would ship hard-coded zh-TW to en / ja viewers, so the contract
  // for every rejection is an error CODE (`{ ok: false, code }`) that
  // `describeQuizError` maps to a dictionary entry. The exact-match assertions
  // above and below are deliberate: a loose match would still pass if someone
  // reintroduced a prose message alongside the code.
  it('refuses in solo mode with a code, not prose', async () => {
    queueDbResult([SOLO_GROUP])
    expect(await submitPartnerQuizAnswers({
      sessionId: 'sess-solo',
      answers: GOOD_ANSWERS,
    })).toEqual({ ok: false, code: 'solo_group' })
  })
})
