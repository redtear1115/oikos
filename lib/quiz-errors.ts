import { describeError } from './errors'
import type { Translations } from './i18n/locales/zh-TW'

/**
 * Map a partner-quiz server-action error to a user-facing localized string.
 * Error codes are the literal strings thrown by `actions/partnerQuiz.ts`;
 * anything else flows through `describeError` (network detection + generic
 * fallback).
 *
 * Mirrors `describeMembershipError` — same shape, same `solo_group` code.
 */
export function describeQuizError(
  e: unknown,
  t: Translations['quiz']['errors'],
  offlineMessage: string,
): string {
  if (e instanceof Error) {
    switch (e.message) {
      case 'solo_group': return t.solo
    }
  }
  return describeError(e, t.submitFailed, offlineMessage)
}
