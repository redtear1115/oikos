import { describe, it, expect } from 'vitest'
import { describeQuizError } from '@/lib/quiz-errors'
import { zhTW } from '@/lib/i18n/locales/zh-TW'
import { zhCN } from '@/lib/i18n/locales/zh-CN'
import { en } from '@/lib/i18n/locales/en'
import { ja } from '@/lib/i18n/locales/ja'

/**
 * #1140 — `submitPartnerQuizAnswers` used to throw zh-TW prose, which
 * `QuestionCard` rendered verbatim to every locale. Every rejection is now a
 * code resolved here.
 *
 * The failure this guards against is invisible in zh-TW: `already_answered`
 * maps to '你已經答完了', which is character-for-character the sentence the
 * action used to throw. A zh-TW-only assertion would pass just as happily
 * against the old hard-coded string, so the codes are checked against all four
 * dictionaries — en and ja are what actually prove the lookup happened.
 */

const OFFLINE = 'offline'
const locales = { 'zh-TW': zhTW, 'zh-CN': zhCN, en, ja } as const

const CODES = [
  ['already_answered', (q: typeof zhTW.quiz) => q.errors.alreadyAnswered],
  ['already_revealed', (q: typeof zhTW.quiz) => q.errors.alreadyRevealed],
  ['wrong_group',      (q: typeof zhTW.quiz) => q.errors.wrongGroup],
  ['session_not_found', (q: typeof zhTW.quiz) => q.errorNotFound],
  ['solo_group',       (q: typeof zhTW.quiz) => q.errors.solo],
] as const

describe('describeQuizError', () => {
  for (const [code, pick] of CODES) {
    for (const [name, dict] of Object.entries(locales)) {
      it(`maps ${code} to the ${name} dictionary entry`, () => {
        const out = describeQuizError(new Error(code), dict.quiz, OFFLINE, dict.errors.actions)
        expect(out).toBe(pick(dict.quiz))
        // Never leak the wire code to the screen.
        expect(out).not.toContain(code)
      })
    }
  }

  it('resolves already_answered to a different string per locale', () => {
    const seen = Object.values(locales).map((d) =>
      describeQuizError(new Error('already_answered'), d.quiz, OFFLINE, d.errors.actions),
    )
    // en and ja must not be the zh-TW sentence — that was the whole bug.
    expect(seen[2]).toBe(en.quiz.errors.alreadyAnswered)
    expect(seen[3]).toBe(ja.quiz.errors.alreadyAnswered)
    expect(seen[2]).not.toBe(zhTW.quiz.errors.alreadyAnswered)
    expect(seen[3]).not.toBe(zhTW.quiz.errors.alreadyAnswered)
  })

  // #1156 closed the seam this used to document: `describeError` no longer
  // returns `e.message`, so an unmapped message becomes `submitFailed` instead
  // of landing on screen verbatim.
  it('falls back to submitFailed for an unmapped Error message', () => {
    expect(describeQuizError(new Error('boom'), en.quiz, OFFLINE, en.errors.actions))
      .toBe(en.quiz.errors.submitFailed)
  })

  it('localizes validateAnswersBatch codes through the shared action dictionary', () => {
    expect(describeQuizError(new Error('quiz_answers_incomplete'), ja.quiz, OFFLINE, ja.errors.actions))
      .toBe(ja.errors.actions.quiz_answers_incomplete)
  })

  it('falls back to submitFailed for an Error with no message', () => {
    expect(describeQuizError(new Error(''), en.quiz, OFFLINE, en.errors.actions))
      .toBe(en.quiz.errors.submitFailed)
  })

  it('falls back to submitFailed for a non-Error rejection', () => {
    expect(describeQuizError('nope', ja.quiz, OFFLINE, ja.errors.actions))
      .toBe(ja.quiz.errors.submitFailed)
  })
})
