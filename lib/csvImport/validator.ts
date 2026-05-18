/**
 * Row-level validation for the import pipeline.
 *
 * Hard rules come from the spec (csv-import-design.md):
 *   - date required, must parse, must not be > 7 days in the future
 *   - amount required, positive integer ≤ 9_999_999, ≠ 0
 *   - description required (falls back to "匯入紀錄" upstream if blank,
 *     but the validator surfaces it as a warning so the UI can prompt)
 *   - category falls back to 'other' silently (warning, not error)
 *
 * Warnings don't block import; errors do.
 */

import { isValidCategoryId } from '@/lib/categories'
import type { PartialImportRow, ValidationResult } from './types'

const MAX_AMOUNT = 9_999_999
const FUTURE_DAYS_GRACE = 7

function daysFromNow(d: Date): number {
  const ms = d.getTime() - Date.now()
  return ms / (1000 * 60 * 60 * 24)
}

export function validateRow(
  row: PartialImportRow,
  rowIndex: number,
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const prefix = `row ${rowIndex + 1}`

  // ── date ──
  if (!row.date) {
    errors.push(`${prefix}: missing or unparseable date`)
  } else if (isNaN(row.date.getTime())) {
    errors.push(`${prefix}: invalid date`)
  } else if (daysFromNow(row.date) > FUTURE_DAYS_GRACE) {
    warnings.push(`${prefix}: date is more than ${FUTURE_DAYS_GRACE} days in the future`)
  }

  // ── amount ──
  if (row.amount === undefined || row.amount === null) {
    errors.push(`${prefix}: missing or unparseable amount`)
  } else if (!Number.isFinite(row.amount)) {
    errors.push(`${prefix}: amount is not a finite number`)
  } else if (!Number.isInteger(row.amount)) {
    errors.push(`${prefix}: amount must be an integer (got ${row.amount})`)
  } else if (row.amount <= 0) {
    errors.push(`${prefix}: amount must be positive (got ${row.amount})`)
  } else if (row.amount > MAX_AMOUNT) {
    errors.push(`${prefix}: amount exceeds max of ${MAX_AMOUNT}`)
  }

  // ── type ──
  if (!row.type) {
    errors.push(`${prefix}: missing transaction type (expense/income)`)
  } else if (row.type !== 'expense' && row.type !== 'income') {
    errors.push(`${prefix}: invalid type "${row.type as string}"`)
  }

  // ── category ── (warning only; mapper already falls back to 'other')
  if (!row.category) {
    warnings.push(`${prefix}: category fell back to 'other' (empty)`)
  } else if (!isValidCategoryId(row.category)) {
    warnings.push(`${prefix}: unknown category "${row.category}", will fall back to 'other'`)
  }

  // ── description ── (warning only)
  if (!row.description) {
    warnings.push(`${prefix}: description is empty`)
  } else if (row.description.length > 500) {
    errors.push(`${prefix}: description exceeds 500 characters`)
  }

  // ── paidBy ──
  if (!row.paidBy) {
    errors.push(`${prefix}: missing paidBy`)
  } else if (row.paidBy !== 'viewer' && row.paidBy !== 'partner') {
    errors.push(`${prefix}: invalid paidBy "${row.paidBy as string}"`)
  }

  // ── splitType ──
  const VALID_SPLITS = ['half', 'all_mine', 'all_theirs', 'weighted']
  if (!row.splitType) {
    errors.push(`${prefix}: missing splitType`)
  } else if (!VALID_SPLITS.includes(row.splitType)) {
    errors.push(`${prefix}: invalid splitType "${row.splitType as string}"`)
  }

  // ── multi-currency pair ── (both or neither)
  const hasCur = row.originalCurrency !== undefined
  const hasOrigAmt = row.originalAmount !== undefined
  if (hasCur !== hasOrigAmt) {
    errors.push(`${prefix}: originalCurrency and originalAmount must be set together`)
  }

  return { ok: errors.length === 0, errors, warnings }
}
