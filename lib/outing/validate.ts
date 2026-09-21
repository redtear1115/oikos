import { actionError } from '@/lib/action-errors'
import { MAX_AMOUNT } from '@/lib/validators'

/**
 * Input rules for the 出遊 actions (#943). Pure: every function either returns
 * the normalised value or throws an `actionError` code, so the rules can be
 * unit-tested without a database and the actions stay thin.
 *
 * The length limits mirror the CHECK constraints in
 * drizzle/0066_outing_tables.sql. They are counted in code points
 * (`Array.from`), because Postgres `char_length` counts characters, not UTF-16
 * units: '🍜'.length is 2 in JS but 1 in Postgres.
 */

export const OUTING_PARTICIPANT_CAP = 20
export const OUTING_NAME_MAX = 100
export const OUTING_PARTICIPANT_NAME_MAX = 40
export const OUTING_DESCRIPTION_MAX = 100
export const OUTING_CATEGORY_MAX = 32
/** How much of the outing name goes into the folded Settlement's note. */
export const OUTING_FOLD_NOTE_NAME_MAX = 40

const codePointLength = (s: string) => Array.from(s).length
const truncateCodePoints = (s: string, max: number) => Array.from(s).slice(0, max).join('')

/** Integer, > 0, ≤ MAX_AMOUNT. Anything that is not a finite integer number is `amount_invalid`. */
export function validateOutingAmount(amount: unknown): number {
  if (typeof amount !== 'number' || !Number.isInteger(amount)) throw actionError('amount_invalid')
  if (amount <= 0) throw actionError('amount_not_positive')
  if (amount > MAX_AMOUNT) throw actionError('amount_too_large')
  return amount
}

export function normalizeOutingName(name: unknown): string {
  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (!trimmed) throw actionError('outing_name_empty')
  if (codePointLength(trimmed) > OUTING_NAME_MAX) throw actionError('outing_name_too_long')
  return trimmed
}

export function normalizeParticipantName(name: unknown): string {
  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (!trimmed) throw actionError('outing_participant_name_empty')
  if (codePointLength(trimmed) > OUTING_PARTICIPANT_NAME_MAX) throw actionError('outing_participant_name_too_long')
  return trimmed
}

/**
 * A group member's name, copied into their participant row when the outing is
 * created. Profile names set in the app are ≤ 32 (validateName), but names
 * seeded from the OAuth provider at sign-up are not validated, so this
 * truncates instead of rejecting — creating an outing must not fail because
 * of a long Google display name.
 */
export function memberParticipantName(displayName: string | null | undefined, fallback: string): string {
  const trimmed = (displayName ?? '').trim()
  return truncateCodePoints(trimmed || fallback, OUTING_PARTICIPANT_NAME_MAX)
}

export function normalizeDescription(description: unknown): string | null {
  if (description === undefined || description === null) return null
  if (typeof description !== 'string') throw actionError('outing_description_too_long')
  const trimmed = description.trim()
  if (!trimmed) return null
  if (codePointLength(trimmed) > OUTING_DESCRIPTION_MAX) throw actionError('outing_description_too_long')
  return trimmed
}

/** Unknown / oversized categories are dropped rather than rejected: category is a display hint only. */
export function normalizeCategory(category: unknown): string | null {
  if (typeof category !== 'string') return null
  const trimmed = category.trim()
  if (!trimmed || codePointLength(trimmed) > OUTING_CATEGORY_MAX) return null
  return trimmed
}

/**
 * The participant ids an expense is split across. Deduplicated; must be
 * non-empty; never more than the cap (a longer list cannot all be real
 * participants of one outing, so it is rejected before touching the DB).
 * Membership in the outing is checked by the action, under the row lock.
 */
export function normalizeShareIds(ids: unknown): string[] {
  if (!Array.isArray(ids) || ids.length === 0) throw actionError('outing_share_empty')
  if (!ids.every((id) => typeof id === 'string' && id.length > 0)) throw actionError('outing_participant_not_found')
  const unique = Array.from(new Set(ids as string[]))
  if (unique.length > OUTING_PARTICIPANT_CAP) throw actionError('outing_participant_not_found')
  return unique
}

/** Bound the outing name inside the folded Settlement's note. */
export function foldNoteName(outingName: string): string {
  return truncateCodePoints(outingName, OUTING_FOLD_NOTE_NAME_MAX)
}

export interface FoldSettlement {
  paidBy: string
  amount: number
}

/**
 * Map the couple's mutual outing debt onto the one Settlement row that folds
 * it into the main ledger, or `null` when nothing should be written.
 *
 * `coupleNet` is in main-ledger convention (lib/outing/foldback.ts): > 0 means
 * member_b owes member_a. A Settlement paid by member_a moves GroupBalance by
 * +amount (lib/db/queries/balance.ts, settlement deltas), which is exactly
 * "member_b now owes member_a `amount` more". So:
 *   net > 0 → paid_by member_a, amount net
 *   net < 0 → paid_by member_b, amount |net|
 *   net = 0, or the group is solo → no row
 */
export function foldSettlementFor(
  coupleNet: number,
  memberA: string,
  memberB: string | null,
): FoldSettlement | null {
  if (memberB === null || coupleNet === 0) return null
  return coupleNet > 0
    ? { paidBy: memberA, amount: coupleNet }
    : { paidBy: memberB, amount: -coupleNet }
}
