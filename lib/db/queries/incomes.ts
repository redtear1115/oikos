import { db } from '@/lib/db/client'
import { incomeTransactions } from '@/lib/db/schema'
import { and, eq, isNull, desc, sql, type SQL } from 'drizzle-orm'
import type { DrillFilter } from '@/lib/drill'
import { ASSET_FILTER_NONE, type DateRange } from '@/lib/filter'
import type { EpochWindow } from './epoch'
import {
  amountClause,
  andClause,
  assetIdsClause,
  categoryInClause,
  dateColumnClause,
  epochClause,
  eqValueClause,
} from './_predicates'

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
  /** Inclusive amount bounds (NT$ integers). null on either side = open. */
  amountMin: number | null
  amountMax: number | null
  /** True when an expense-only dim is active and income rows should be hidden. */
  cutAll: boolean
}

/**
 * Drizzle-condition variant of the asset multi-select clause. The
 * `_predicates` helper returns a string-or-SQL-column-aware fragment which
 * works inline; here we need a drizzle `SQL` chunk that references the typed
 * `incomeTransactions.assetId` column so the rest of the `and(...)` set stays
 * typed.
 */
function assetIdsDrizzleClause(assetIds: string[]): SQL | undefined {
  if (assetIds.length === 0) return undefined
  const uuids: string[] = []
  let includeNone = false
  for (const id of assetIds) {
    if (id === ASSET_FILTER_NONE) includeNone = true
    else uuids.push(id)
  }
  if (uuids.length === 0 && includeNone) return isNull(incomeTransactions.assetId)
  const inList = sql`${incomeTransactions.assetId} IN (${sql.join(uuids.map((u) => sql`${u}::uuid`), sql`, `)})`
  if (!includeNone) return inList
  return sql`(${incomeTransactions.assetId} IS NULL OR ${inList})`
}

export async function listIncomesPaged(
  groupId: string,
  cursor: IncomeCursor | null,
  limit: number = 20,
  monthKey: string | undefined,
  drill: DrillFilter | null | undefined,
  filter: ResolvedIncomeFilter | undefined,
  dateRange: DateRange | null | undefined,
  epochWindow: EpochWindow,
): Promise<IncomeRow[]> {
  // Drill that doesn't target income (expense category / asset) → empty page.
  // Lets the income tab render zero rows under an incompatible drill instead
  // of bleeding through unfiltered.
  if (drill && drill.kind !== 'income') return []
  // Structured filter using an expense-only dim (e.g. expense-category /
  // split) → empty page on the income tab. Same UX contract as drill.
  if (filter?.cutAll) return []

  const conditions: (SQL | undefined)[] = [
    eq(incomeTransactions.groupId, groupId),
    isNull(incomeTransactions.deletedAt),
    cursor
      ? sql`(occurred_at, created_at) < (${cursor.occurredAt}::date, ${cursor.createdAt}::timestamptz)`
      : undefined,
    dateColumnClause(monthKey, dateRange, incomeTransactions.occurredAt),
    drill?.kind === 'income' ? eq(incomeTransactions.category, drill.categoryId) : undefined,
    eqValueClause(incomeTransactions.recipientId, filter?.recipientId),
    filter ? categoryInClause(filter.incomeCategories, incomeTransactions.category) : undefined,
    filter ? amountClause(filter.amountMin, filter.amountMax, incomeTransactions.amount) : undefined,
    filter ? assetIdsDrizzleClause(filter.assetIds) : undefined,
    epochClause(incomeTransactions.createdAt, epochWindow),
  ]

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

export async function listIncomeMonthSummary(
  groupId: string,
  yyyymm: string,  // e.g. '2026-05'
  epochWindow: EpochWindow,
): Promise<{ total: number; count: number }> {
  const [row] = await db.execute<{ total: string; count: string }>(sql`
    SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
    FROM "IncomeTransactions"
    WHERE group_id = ${groupId}
      AND deleted_at IS NULL
      AND to_char(occurred_at, 'YYYY-MM') = ${yyyymm}
      ${andClause(epochClause('created_at', epochWindow))}
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
  dateRange: DateRange | null | undefined,
  filter: ResolvedIncomeFilter | undefined,
  epochWindow: EpochWindow,
): Promise<IncomeCategoryStatRow[]> {
  if (filter?.cutAll) return []
  const rows = await db.execute<{ category: string; total: number; count: number }>(sql`
    SELECT
      category,
      SUM(amount)::int AS total,
      COUNT(*)::int AS count
    FROM "IncomeTransactions"
    WHERE group_id = ${groupId}
      AND deleted_at IS NULL
      ${andClause(dateColumnClause(monthKey, dateRange))}
      ${andClause(eqValueClause('recipient_id', filter?.recipientId))}
      ${andClause(filter ? categoryInClause(filter.incomeCategories) : undefined)}
      ${andClause(filter ? assetIdsClause('asset_id', filter.assetIds) : undefined)}
      ${andClause(filter ? amountClause(filter.amountMin, filter.amountMax) : undefined)}
      ${andClause(epochClause('created_at', epochWindow))}
    GROUP BY category
    ORDER BY total DESC
  `)
  return rows.map((r) => ({ key: r.category, total: r.total, count: r.count }))
}
