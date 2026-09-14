// Pure helpers shared between server actions, queries, and UI for the
// partner-quiz feature. Kept dependency-free so they are trivially unit
// testable (mirrors lib/monthlyReview.ts).
//
// The question pool is i18n-driven: the strings live in
// `lib/i18n/locales/*.ts` under `quiz.questions.<key>`. Keys here are the
// stable identifiers and must stay in sync with the i18n side. Append-only —
// never rename or drop a key, otherwise existing rows in
// `PartnerQuizSessions.question_keys` lose their pointer.

// Only dependency: the error-code builder (itself dependency-free), so batch
// validation failures localize instead of rendering zh-TW prose (#1156).
import { actionError } from '@/lib/action-errors'

export const PARTNER_QUIZ_QUESTION_KEYS = [
  'impulse',
  'risk',
  'transparency',
  'big_purchase',
  'future',
  'recording_motive',
] as const

export type PartnerQuizQuestionKey = (typeof PARTNER_QUIZ_QUESTION_KEYS)[number]

export const PARTNER_QUIZ_CHOICE_KEYS = ['a', 'b', 'c'] as const
export type PartnerQuizChoiceKey = (typeof PARTNER_QUIZ_CHOICE_KEYS)[number]

export const PARTNER_QUIZ_QUESTIONS_PER_SESSION = 3

export function isPartnerQuizQuestionKey(value: unknown): value is PartnerQuizQuestionKey {
  return typeof value === 'string'
    && (PARTNER_QUIZ_QUESTION_KEYS as readonly string[]).includes(value)
}

export function isPartnerQuizChoiceKey(value: unknown): value is PartnerQuizChoiceKey {
  return typeof value === 'string'
    && (PARTNER_QUIZ_CHOICE_KEYS as readonly string[]).includes(value)
}

/**
 * Pick 3 distinct keys from the 6-key pool. Uses Fisher-Yates with the
 * provided RNG so tests can pin the result; defaults to Math.random.
 */
export function pickQuizQuestions(
  rng: () => number = Math.random,
  count: number = PARTNER_QUIZ_QUESTIONS_PER_SESSION,
): PartnerQuizQuestionKey[] {
  const pool: PartnerQuizQuestionKey[] = [...PARTNER_QUIZ_QUESTION_KEYS]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, count)
}

export interface PartnerQuizAnswerInput {
  questionKey: string
  choiceKey: string
}

export interface ValidatedPartnerQuizAnswers {
  answers: { questionKey: PartnerQuizQuestionKey; choiceKey: PartnerQuizChoiceKey }[]
}

/**
 * Validates a batch-submit of 3 answers against the session's question_keys.
 * Throws on shape errors, unknown keys, duplicates, or missing/extra answers.
 */
export function validateAnswersBatch(
  sessionQuestionKeys: readonly string[],
  input: PartnerQuizAnswerInput[],
): ValidatedPartnerQuizAnswers {
  if (!Array.isArray(input)) {
    throw actionError('quiz_answers_malformed')
  }
  if (input.length !== sessionQuestionKeys.length) {
    throw actionError('quiz_answers_incomplete')
  }

  const seen = new Set<string>()
  const out: ValidatedPartnerQuizAnswers['answers'] = []
  for (const row of input) {
    if (!row || typeof row !== 'object') {
      throw actionError('quiz_answers_malformed')
    }
    if (!isPartnerQuizQuestionKey(row.questionKey)) {
      throw actionError('quiz_question_out_of_range')
    }
    if (!isPartnerQuizChoiceKey(row.choiceKey)) {
      throw actionError('quiz_choice_out_of_range')
    }
    if (!sessionQuestionKeys.includes(row.questionKey)) {
      throw actionError('quiz_question_out_of_range')
    }
    if (seen.has(row.questionKey)) {
      throw actionError('quiz_question_duplicate')
    }
    seen.add(row.questionKey)
    out.push({ questionKey: row.questionKey, choiceKey: row.choiceKey })
  }
  return { answers: out }
}

export interface PartnerQuizStatusInput {
  hasSession: boolean
  selfAnswered: boolean
  partnerAnswered: boolean
  revealedAt: Date | null
}

export type PartnerQuizStatus =
  | 'none'
  | 'invited'
  | 'self_pending_partner_pending'
  | 'self_pending_partner_done'
  | 'self_done_partner_pending'
  | 'revealed'

/**
 * Maps raw session/answer state to a single status string used by the
 * invitation card and the answer page to pick which surface to show.
 *
 * - `none`: solo group (caller decides — we don't see member_b here)
 * - `invited`: no session yet → render invite card
 * - `self_pending_partner_pending` / `self_pending_partner_done`: viewer needs
 *   to answer; the second variant phrases CTA as「對方答完了，輪你了」.
 * - `self_done_partner_pending`: viewer is waiting; CTA disappears.
 * - `revealed`: reveal screen is the surface.
 */
export function derivePartnerQuizStatus(input: PartnerQuizStatusInput): PartnerQuizStatus {
  if (input.revealedAt) return 'revealed'
  if (!input.hasSession) return 'invited'
  if (input.selfAnswered && input.partnerAnswered) {
    // Should be impossible — both answered means reveal should have written
    // in the same transaction. Fall back to revealed so the UI doesn't lie.
    return 'revealed'
  }
  if (input.selfAnswered) return 'self_done_partner_pending'
  if (input.partnerAnswered) return 'self_pending_partner_done'
  return 'self_pending_partner_pending'
}
