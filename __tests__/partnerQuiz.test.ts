import { describe, it, expect } from 'vitest'
import {
  PARTNER_QUIZ_QUESTION_KEYS,
  PARTNER_QUIZ_CHOICE_KEYS,
  PARTNER_QUIZ_QUESTIONS_PER_SESSION,
  derivePartnerQuizStatus,
  isPartnerQuizChoiceKey,
  isPartnerQuizQuestionKey,
  pickQuizQuestions,
  validateAnswersBatch,
} from '@/lib/partnerQuiz'

describe('pickQuizQuestions', () => {
  it('returns 3 distinct keys from the 6-key pool', () => {
    const out = pickQuizQuestions()
    expect(out.length).toBe(PARTNER_QUIZ_QUESTIONS_PER_SESSION)
    const unique = new Set(out)
    expect(unique.size).toBe(out.length)
    for (const k of out) {
      expect(PARTNER_QUIZ_QUESTION_KEYS).toContain(k)
    }
  })

  it('is deterministic with a fixed RNG', () => {
    const rng = mulberry32(0xC0FFEE)
    const rng2 = mulberry32(0xC0FFEE)
    expect(pickQuizQuestions(rng)).toEqual(pickQuizQuestions(rng2))
  })
})

describe('validateAnswersBatch', () => {
  const SESSION_KEYS = ['impulse', 'risk', 'transparency'] as const

  it('accepts the happy path: 3 answers, all keys present, valid choices', () => {
    const out = validateAnswersBatch(SESSION_KEYS, [
      { questionKey: 'impulse', choiceKey: 'a' },
      { questionKey: 'risk', choiceKey: 'b' },
      { questionKey: 'transparency', choiceKey: 'c' },
    ])
    expect(out.answers).toHaveLength(3)
    expect(out.answers[0].questionKey).toBe('impulse')
    expect(out.answers[0].choiceKey).toBe('a')
  })

  it('rejects an answer with a key not in the session', () => {
    expect(() => validateAnswersBatch(SESSION_KEYS, [
      { questionKey: 'future', choiceKey: 'a' },
      { questionKey: 'risk', choiceKey: 'b' },
      { questionKey: 'transparency', choiceKey: 'c' },
    ])).toThrow(/範圍/)
  })

  it('rejects a choice outside a/b/c', () => {
    expect(() => validateAnswersBatch(SESSION_KEYS, [
      { questionKey: 'impulse', choiceKey: 'd' },
      { questionKey: 'risk', choiceKey: 'b' },
      { questionKey: 'transparency', choiceKey: 'c' },
    ])).toThrow(/選項/)
  })

  it('rejects duplicates of the same question_key', () => {
    expect(() => validateAnswersBatch(SESSION_KEYS, [
      { questionKey: 'impulse', choiceKey: 'a' },
      { questionKey: 'impulse', choiceKey: 'b' },
      { questionKey: 'transparency', choiceKey: 'c' },
    ])).toThrow(/重複/)
  })

  it('rejects a batch that misses one question or has too many', () => {
    expect(() => validateAnswersBatch(SESSION_KEYS, [
      { questionKey: 'impulse', choiceKey: 'a' },
      { questionKey: 'risk', choiceKey: 'b' },
    ])).toThrow(/3 題/)

    expect(() => validateAnswersBatch(SESSION_KEYS, [
      { questionKey: 'impulse', choiceKey: 'a' },
      { questionKey: 'risk', choiceKey: 'b' },
      { questionKey: 'transparency', choiceKey: 'c' },
      { questionKey: 'transparency', choiceKey: 'a' },
    ])).toThrow(/3 題/)
  })
})

describe('derivePartnerQuizStatus', () => {
  it('returns invited when no session yet', () => {
    expect(derivePartnerQuizStatus({
      hasSession: false, selfAnswered: false, partnerAnswered: false, revealedAt: null,
    })).toBe('invited')
  })

  it('returns self_pending_partner_done when partner finished first', () => {
    expect(derivePartnerQuizStatus({
      hasSession: true, selfAnswered: false, partnerAnswered: true, revealedAt: null,
    })).toBe('self_pending_partner_done')
  })

  it('returns self_done_partner_pending when viewer finished first', () => {
    expect(derivePartnerQuizStatus({
      hasSession: true, selfAnswered: true, partnerAnswered: false, revealedAt: null,
    })).toBe('self_done_partner_pending')
  })

  it('returns self_pending_partner_pending when nobody has answered yet', () => {
    expect(derivePartnerQuizStatus({
      hasSession: true, selfAnswered: false, partnerAnswered: false, revealedAt: null,
    })).toBe('self_pending_partner_pending')
  })

  it('returns revealed once revealed_at is set', () => {
    expect(derivePartnerQuizStatus({
      hasSession: true, selfAnswered: true, partnerAnswered: true, revealedAt: new Date(),
    })).toBe('revealed')
  })

  it('returns revealed defensively when both answered but reveal_at not set yet', () => {
    // The action stamps revealed_at in the same transaction, so this is a
    // recovery path for an unexpected mid-state. UI shouldn't lie.
    expect(derivePartnerQuizStatus({
      hasSession: true, selfAnswered: true, partnerAnswered: true, revealedAt: null,
    })).toBe('revealed')
  })
})

describe('key guards', () => {
  it('accepts all 6 question_key constants', () => {
    for (const k of PARTNER_QUIZ_QUESTION_KEYS) {
      expect(isPartnerQuizQuestionKey(k)).toBe(true)
    }
  })

  it('rejects an unknown question_key', () => {
    expect(isPartnerQuizQuestionKey('not_a_key')).toBe(false)
    expect(isPartnerQuizQuestionKey(undefined)).toBe(false)
  })

  it('accepts a/b/c for choice_key, rejects everything else', () => {
    for (const k of PARTNER_QUIZ_CHOICE_KEYS) {
      expect(isPartnerQuizChoiceKey(k)).toBe(true)
    }
    expect(isPartnerQuizChoiceKey('d')).toBe(false)
    expect(isPartnerQuizChoiceKey(1)).toBe(false)
  })
})

// Deterministic RNG used to assert pickQuizQuestions stability.
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6D2B79F5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
