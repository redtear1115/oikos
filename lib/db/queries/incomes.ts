import { db } from '@/lib/db/client'
import { incomeTransactions } from '@/lib/db/schema'
import { and, eq, isNull, desc, sql, type SQL } from 'drizzle-orm'
import type { DrillFilter } from '@/lib/drill'
import {
  ASSET_FILTER_NONE,
  resolveDateRangeToDateBounds,
  type DateRange,
} from '@/lib/filter'

export interface IncomeRow {
  id: string
  groupId: string
  recipientId: string
  amount: number
  category: string
  source: string | null
  assetId: string | null
  occurredAt: string  // YYYY-MM-DD
  createdAt: Date
}

export interface IncomeCursor {
  occurredAt: string  // YYYY-MM-DD
  createdAt: string   // ISO timestamp
}

/**
 * Resolved structured-filter shape for the income tab. Mirrors the cash-tx
 * resolved filter but only keeps dimensions meaningful to income rows:
 * recipient (= payer dim), assetIds, and the income-side category multi-select.
 * Expense categories are intentionally NOT applied here — they're a separate
 * vocabulary. If split or expense-only categories are active (and the user
 * hasn't picked any income category to compensate), the caller sets
 * `cutAll=true` to short-circuit to an empty result.
 */
export interface ResolvedIncomeFilter {
  recipientId: string | null
  assetIds: string[]   // empty = all; ASSET_FILTER_NONE for unassigned
  /** Empty = all income categories pass. Narrows by IncomeCategoryId membership. */
  incomeCategories: string[]
  /** True when an expense-only dim is active and income rows should be hidden. */
  cutAll: boolean
}

/**
 * Build a drizzle SQL fragment matching the asset-multi-select filter, or
 * null when no asset filter is active. Members may include the
 * ASSET_FILTER_NONE sentinel for the「未歸屬」bucket; the helper expands it to
 * `IS NULL` and ORs it with any uuid `IN (...)` predicate.
 */
function assetIdsClause(assetIds: string[]): SQL | null {
  if (assetIds.length === 0) return null
  const uuids: string[] = []
  let includeNone = false
  for (const id of assetIds) {
    if (id === ASSET_FILTER_NONE) includeNone = true
    else uuids.push(id)
  }
  if (uuids.length === 0 && includeNone) {
    return isNull(incomeTransactions.assetId)
  }
  if (uuids.length > 0 && !includeNone) {
    return sql`${incomeTransactions.assetId} IN (${sql.join(uuids.map((u) => sql`${u}::uuid`), sql`, `)})`
  }
  return sql`(${incomeTransactions.assetId} IS NULL OR ${incomeTransactions.assetId} IN (${sql.join(uuids.map((u) => sql`${u}::uuid`), sql`, `)}))`
}

export async function listIncomesPaged(
  groupId: string,
  cursor: IncomeCursor | null,
  limit = 20,
  monthKey?: string,
  drill?: DrillFilter | null,
  filter?: ResolvedIncomeFilter,
  dateRange?: DateRange | null,
): Promise<IncomeRow[]> {
  // Drill that doesn't target income (expense category / asset) → empty page.
  // Lets the income tab render zero rows under an incompatible drill instead
  // of bleeding through unfiltered.
  if (drill && drill.kind !== 'income') return []
  // Structured filter using an expense-only dim (e.g. expense-category /
  // split) → empty page on the income tab. Same UX contract as drill.
  if (filter?.cutAll) return []

  const conditions: SQL[] = [
    eq(incomeTransactions.groupId, groupId),
    isNull(incomeTransactions.deletedAt),
  ]
  if (cursor) {
    conditions.push(
      sql`(occurred_at, created_at) < (${cursor.occurredAt}::date, ${cursor.createdAt}::timestamptz)`,
    )
  }

  // Custom date range overrides monthKey when provided. Reuse the helper from
  // lib/filter.ts so the resolution logic lives in one place.
  const bounds = dateRange
    ? resolveDateRangeToDateBounds(dateRange)
    : monthKey
      ? { startDate: `${monthKey}-01`, endDateExclusive: nextMonthFirst(monthKey) }
      : null
  if (bounds) {
    conditions.push(sql`occurred_at >= ${bounds.startDate}::date`)
    conditions.push(sql`occurred_at <  ${bounds.endDateExclusive}::date`)
  }

  if (drill?.kind === 'income') {
    conditions.push(eq(incomeTransactions.category, drill.categoryId))
  }
  if (filter?.recipientId) {
    conditions.push(eq(incomeTransactions.recipientId, filter.recipientId))
  }
  if (filter && filter.incomeCategories.length > 0) {
    conditions.push(
      sql`${incomeTransactions.category} IN (${sql.join(filter.incomeCategories.map((c) => sql`${c}`), sql`, `)})`,
    )
  }

  const assetCl = filter ? assetIdsClause(filter.assetIds) : null
  if (assetCl) conditions.push(assetCl)

  const rows = await db
    .select({
      id: incomeTransactions.id,
      groupId: incomeTransactions.groupId,
      recipientId: incomeTransactions.recipientId,
      amount: incomeTransactions.amount,
      category: incomeTransactions.category,
      source: incomeTransactions.source,
      assetId: incomeTransactions.assetId,
      occurredAt: incomeTransactions.occurredAt,
      createdAt: incomeTransactions.createdAt,
    })
    .from(incomeTransactions)
    .where(and(...conditions))
    .orderBy(desc(incomeTransactions.occurredAt), desc(incomeTransactions.createdAt))
    .limit(limit)

  return rows
}

function nextMonthFirst(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  const idx = y * 12 + (m - 1) + 1
  const ny = Math.floor(idx / 12)
  const nm = ((idx % 12) + 12) % 12 + 1
  return `${ny}-${String(nm).padStart(2, '0')}-01`
}

export async function listIncomeMonthSummary(
  groupId: string,
  yyyymm: string,  // e.g. '2026-05'
): Promise<{ total: number; count: number }> {
  const [row] = await db.execute<{ total: string; count: string }>(sql`
    SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
    FROM "IncomeTransactions"
    WHERE group_id = ${groupId}
      AND deleted_at IS NULL
      AND to_char(occurred_at, 'YYYY-MM') = ${yyyymm}
  `)
  return { total: parseInt(row.total, 10), count: parseInt(row.count, 10) }
}

export interface IncomeCategoryStatRow {
  /** IncomeCategoryId — `salary` / `bonus` / `maturity` / etc. */
  key: string
  total: number
  count: number
}

/**
 * Sum active IncomeTransactions for a group, grouped by category, ordered by
 * total desc. Mirrors `monthlyStatsByCategory` but for the income side.
 * occurred_at is a `date` column (no tz conversion needed — it's already
 * day-level).
 *
 * Date scope: defaults to the local-Taipei calendar month (`monthKey`), but
 * callers can pass `dateRange` for a custom window or `filter` to narrow by
 * recipient / assetIds. If the filter has `cutAll=true` (an expense-only dim
 * is active), this returns an empty array — matches the feed's contract.
 */
export async function monthlyIncomeStatsByCategory(
  groupId: string,
  monthKey: string | undefined,
  dateRange?: DateRange | null,
  filter?: ResolvedIncomeFilter,
): Promise<IncomeCategoryStatRow[]> {
  if (filter?.cutAll) return []

  // Custom date range overrides monthKey when provided. resolveDateRangeToDateBounds
  // returns null for `kind: 'all'` → no date predicate (sum all-time).
  const bounds = dateRange
    ? resolveDateRangeToDateBounds(dateRange)
    : monthKey
      ? { startDate: `${monthKey}-01`, endDateExclusive: nextMonthFirst(monthKey) }
      : null
  const dateClause = bounds
    ? sql`AND occurred_at >= ${bounds.startDate}::date AND occurred_at < ${bounds.endDateExclusive}::date`
    : sql``

  const recipientClause = filter?.recipientId
    ? sql`AND recipient_id = ${filter.recipientId}`
    : sql``

  const incomeCatClause = filter && filter.incomeCategories.length > 0
    ? sql`AND category IN (${sql.join(filter.incomeCategories.map((c) => sql`${c}`), sql`, `)})`
    : sql``

  const assetClause = (() => {
    if (!filter || filter.assetIds.length === 0) return sql``
    const uuids: string[] = []
    let includeNone = false
    for (const id of filter.assetIds) {
      if (id === ASSET_FILTER_NONE) includeNone = true
      else uuids.push(id)
    }
    if (uuids.length === 0 && includeNone) return sql`AND asset_id IS NULL`
    if (uuids.length > 0 && !includeNone) {
      return sql`AND asset_id IN (${sql.join(uuids.map((u) => sql`${u}::uuid`), sql`, `)})`
    }
    return sql`AND (asset_id IS NULL OR asset_id IN (${sql.join(uuids.map((u) => sql`${u}::uuid`), sql`, `)}))`
  })()

  const rows = await db.execute<{ category: string; total: number; count: number }>(sql`
    SELECT
      category,
      SUM(amount)::int AS total,
      COUNT(*)::int AS count
    FROM "IncomeTransactions"
    WHERE group_id = ${groupId}
      AND deleted_at IS NULL
      ${dateClause}
      ${recipientClause}
      ${incomeCatClause}
      ${assetClause}
    GROUP BY category
    ORDER BY total DESC
  `)
  return rows.map((r) => ({ key: r.category, total: r.total, count: r.count }))
}
