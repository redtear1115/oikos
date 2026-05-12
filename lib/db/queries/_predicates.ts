import { sql, type Column, type SQL } from 'drizzle-orm'
import type { SplitType } from '@/lib/balance'
import type { RecordStatus } from '@/lib/validators'
import { ASSET_FILTER_NONE, type DateRange } from '@/lib/filter'
import { monthRangeIso } from '@/lib/monthKey'
import type { EpochWindow } from './epoch'

/**
 * Pure SQL-predicate helpers shared across the query layer. Every helper
 * returns a Drizzle `SQL` chunk **without** a leading `AND`, or `undefined`
 * when the predicate is a no-op. Callers compose them in one of two shapes:
 *
 *   Drizzle: `.where(and(eq(...), epochClause(...), assetIdsClause(...)))`
 *     — `and()` accepts `SQLWrapper | undefined` so the no-op slots fall away
 *     automatically.
 *
 *   Raw SQL: `\`WHERE ... ${andClause(epochClause(...))} ${andClause(...)}\``
 *     — `andClause()` wraps a chunk with `AND` or collapses to empty when the
 *     inner clause is undefined.
 *
 * Centralising these is what lets us add a new dimension (e.g. another scope)
 * without hunting through 7+ inline copies across queries/transactions.ts,
 * incomes.ts, asset.ts, insurance.ts.
 */

/**
 * Column reference — accepted in three shapes so callers can use whichever fits:
 *   - Drizzle `Column` (e.g. `incomeTransactions.assetId`) — preserves type info
 *     and quoted-identifier rendering when composed into a drizzle `and(...)`.
 *   - Raw `SQL` chunk — escape hatch for already-built fragments.
 *   - String literal (e.g. `'ct.asset_id'`) — convenient inside raw SQL templates
 *     where there's no typed column object handy.
 */
export type ColRef = SQL | Column | string

function col(ref: ColRef): SQL | Column {
  return typeof ref === 'string' ? sql.raw(ref) : ref
}

/**
 * Wrap a possibly-null clause with `AND ` for raw SQL template contexts.
 * Returns `sql\`\`` when the clause is null so the template literal stays valid.
 */
export function andClause(clause: SQL | undefined): SQL {
  return clause ? sql`AND ${clause}` : sql``
}

/**
 * Window predicate against a `created_at`-shaped timestamptz column:
 * `col >= started [AND col < ended]`. Returns `null` when the window is absent.
 *
 * The epoch window is the chapter the viewer is reading; every feed/stats
 * query that scopes to a chapter funnels through this helper so a future
 * change (e.g. switching to a half-open epoch on the lower bound) lands in
 * one place.
 */
export function epochClause(
  column: ColRef,
  window: EpochWindow | null | undefined,
): SQL | undefined {
  if (!window) return undefined
  const c = col(column)
  const lower = sql`${c} >= ${window.startedAt.toISOString()}::timestamptz`
  if (!window.endedAt) return lower
  return sql`${lower} AND ${c} < ${window.endedAt.toISOString()}::timestamptz`
}

/**
 * Build the SQL bounds for a timestamptz column scoped to a calendar window in
 * Asia/Taipei local time. Used by CashTransactions (`transacted_at`) and
 * Settlements (`settled_at`).
 *
 * Resolution order: `dateRange` wins over `monthKey`; `dateRange.kind === 'all'`
 * is "no scope" (returns `null`); `dateRange.kind === 'range'` is inclusive on
 * both ends, encoded as half-open via the next-day-exclusive upper bound.
 */
export function dateRangeClause(
  column: ColRef,
  monthKey: string | undefined,
  range: DateRange | null | undefined,
): SQL | undefined {
  let effectiveMonthKey = monthKey
  if (range) {
    if (range.kind === 'all') return undefined
    if (range.kind === 'range') {
      const next = nextDayIso(range.end)
      const c = col(column)
      return sql`(${c} AT TIME ZONE 'Asia/Taipei')::timestamp >= ${range.start}::timestamp
                 AND (${c} AT TIME ZONE 'Asia/Taipei')::timestamp <  ${next}::timestamp`
    }
    effectiveMonthKey = range.monthKey
  }
  if (!effectiveMonthKey) return undefined
  const { startIso, endIso } = monthRangeIso(effectiveMonthKey)
  const c = col(column)
  return sql`(${c} AT TIME ZONE 'Asia/Taipei')::timestamp >= ${startIso}::timestamp
             AND (${c} AT TIME ZONE 'Asia/Taipei')::timestamp <  ${endIso}::timestamp`
}

/**
 * Same shape as `dateRangeClause` but for `date`-typed columns (no tz
 * conversion needed — the column is already day-level). Used by
 * IncomeTransactions (`occurred_at`).
 */
export function dateColumnClause(
  monthKey: string | undefined,
  range: DateRange | null | undefined,
  column: ColRef = 'occurred_at',
): SQL | undefined {
  let effectiveMonthKey = monthKey
  if (range) {
    if (range.kind === 'all') return undefined
    if (range.kind === 'range') {
      const next = nextDayIso(range.end)
      const c = col(column)
      return sql`${c} >= ${range.start}::date AND ${c} <  ${next}::date`
    }
    effectiveMonthKey = range.monthKey
  }
  if (!effectiveMonthKey) return undefined
  const { startIso, endIso } = monthRangeIso(effectiveMonthKey)
  const c = col(column)
  return sql`${c} >= ${startIso.slice(0, 10)}::date AND ${c} <  ${endIso.slice(0, 10)}::date`
}

/**
 * Build a predicate for the asset multi-select filter. Splits the input into
 * uuids (→ `IN (...)`) and the `ASSET_FILTER_NONE` sentinel (→ `IS NULL`),
 * then unions them with OR so the user's「match A or B or 未歸屬」mental model
 * maps directly to one row predicate.
 *
 * - empty list                → `null` (no filter)
 * - sentinel only             → `col IS NULL`
 * - uuids only                → `col IN (...)`
 * - sentinel + uuids          → `(col IS NULL OR col IN (...))`
 */
export function assetIdsClause(column: ColRef, assetIds: string[]): SQL | undefined {
  if (assetIds.length === 0) return undefined
  const uuids: string[] = []
  let includeNone = false
  for (const id of assetIds) {
    if (id === ASSET_FILTER_NONE) includeNone = true
    else uuids.push(id)
  }
  const c = col(column)
  if (uuids.length === 0 && includeNone) return sql`${c} IS NULL`
  const inList = sql`${c} IN (${sql.join(uuids.map((u) => sql`${u}::uuid`), sql`, `)})`
  if (!includeNone) return inList
  return sql`(${c} IS NULL OR ${inList})`
}

/** Equality predicate `col = value`, or `null` when `value` is empty/null. */
export function eqValueClause(
  column: ColRef,
  value: string | null | undefined,
): SQL | undefined {
  if (!value) return undefined
  return sql`${col(column)} = ${value}`
}

/**
 * Inclusive amount-range predicate. `null` on either side = open bound.
 * Both null/undefined → no filter (`null`). Both set → `BETWEEN`.
 */
export function amountClause(
  min: number | null | undefined,
  max: number | null | undefined,
  column: ColRef = 'amount',
): SQL | undefined {
  const hasMin = min !== null && min !== undefined
  const hasMax = max !== null && max !== undefined
  if (!hasMin && !hasMax) return undefined
  const c = col(column)
  if (hasMin && !hasMax) return sql`${c} >= ${min}`
  if (!hasMin && hasMax) return sql`${c} <= ${max}`
  return sql`${c} BETWEEN ${min} AND ${max}`
}

/** Equality predicate against the `record_status` enum. `null` status = no filter. */
export function statusClause(
  status: RecordStatus | null | undefined,
  column: ColRef = 'status',
): SQL | undefined {
  if (!status) return undefined
  return sql`${col(column)} = ${status}::record_status`
}

/** `col IN (...::split_type)` for a non-empty splitType list. */
export function splitTypeClause(
  splitTypes: SplitType[] | readonly SplitType[],
  column: ColRef = 'split_type',
): SQL | undefined {
  if (splitTypes.length === 0) return undefined
  return sql`${col(column)} IN (${sql.join(splitTypes.map((s) => sql`${s}::split_type`), sql`, `)})`
}

/** Generic `col IN (...)` for category-like string vocabularies. */
export function categoryInClause(
  categories: readonly string[],
  column: ColRef = 'category',
): SQL | undefined {
  if (categories.length === 0) return undefined
  return sql`${col(column)} IN (${sql.join(categories.map((c) => sql`${c}`), sql`, `)})`
}

/**
 * Composite tuple cursor: `(sort_at, sort_created) < (cursor.sort_at, cursor.sort_created)`.
 * Returns `null` for the first page (cursor === null).
 */
export function cursorClause(
  sortAtCol: ColRef,
  sortCreatedCol: ColRef,
  cursor: { transactedAt: string; createdAt: string } | null | undefined,
): SQL | undefined {
  if (!cursor) return undefined
  return sql`(${col(sortAtCol)}, ${col(sortCreatedCol)}) < (${cursor.transactedAt}::timestamptz, ${cursor.createdAt}::timestamptz)`
}

/**
 * Convert a YYYY-MM-DD ISO date to the next day (UTC arithmetic). Used to
 * turn an inclusive end date into a half-open `<` bound — keeps the SQL
 * predicate symmetric with the existing `[start, end)` convention.
 */
function nextDayIso(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + 1))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}
