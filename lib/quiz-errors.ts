import { describeError } from './errors'
import type { ActionErrorMessages } from './action-errors'
import type { Translations } from './i18n/locales/zh-TW'

/**
 * Map a partner-quiz server-action error to a user-facing localized string.
 * Error codes are the literal strings thrown by `actions/partnerQuiz.ts`;
 * anything else flows through `describeError` (network detection + generic
 * fallback).
 *
 * Mirrors `describeMembershipError` — same shape, same `solo_group` code. It
 * takes the whole `quiz` dictionary rather than just `quiz.errors` because
 * `session_not_found` reuses `quiz.errorNotFound`, which already exists in all
 * four locales and is also rendered by `QuestionCard`'s bad-key fallback.
 * Duplicating that sentence under `errors` would give the same message two
 * places to drift apart (#1140).
 */
export function describeQuizError(
  e: unknown,
  t: Translations['quiz'],
  offlineMessage: string,
  actionErrors: ActionErrorMessages,
): string {
  if (e instanceof Error) {
    switch (e.message) {
      case 'solo_group':        return t.errors.solo
      case 'already_answered':  return t.errors.alreadyAnswered
      case 'already_revealed':  return t.errors.alreadyRevealed
      case 'session_not_found': return t.errorNotFound
      case 'wrong_group':       return t.errors.wrongGroup
    }
  }
  return describeError(e, t.errors.submitFailed, offlineMessage, actionErrors)
}
