import { db } from '@/lib/db/client'
import { incomeTransactions } from '@/lib/db/schema'
import { and, eq, isNull, desc, sql } from 'drizzle-orm'
import type { DrillFilter } from '@/lib/drill'

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

export async function listIncomesPaged(
  groupId: string,
  cursor: IncomeCursor | null,
  limit = 20,
  monthKey?: string,
  drill?: DrillFilter | null,
): Promise<IncomeRow[]> {
  // Drill that doesn't target income (expense category / asset) → empty page.
  // Lets the income tab render zero rows under an incompatible drill instead
  // of bleeding through unfiltered.
  if (drill && drill.kind !== 'income') return []

  const conditions = [
    eq(incomeTransactions.groupId, groupId),
    isNull(incomeTransactions.deletedAt),
  ]
  if (cursor) {
    conditions.push(
      sql`(occurred_at, created_at) < (${cursor.occurredAt}::date, ${cursor.createdAt}::timestamptz)`,
    )
  }
  if (monthKey) {
    // occurred_at is a plain date, no tz conversion needed.
    conditions.push(
      sql`occurred_at >= ${monthKey + '-01'}::date`,
      sql`occurred_at <  (${monthKey + '-01'}::date + INTERVAL '1 month')`,
    )
  }
  if (drill?.kind === 'income') {
    conditions.push(eq(incomeTransactions.category, drill.categoryId))
  }

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
 * Sum active IncomeTransactions for a group within a local-Taipei calendar
 * month, grouped by category, ordered by total desc. Mirrors
 * `monthlyStatsByCategory` but for the income side. occurred_at is a `date`
 * column (no tz conversion needed — it's already day-level).
 */
export async function monthlyIncomeStatsByCategory(
  groupId: string,
  monthKey: string,  // 'YYYY-MM'
): Promise<IncomeCategoryStatRow[]> {
  const rows = await db.execute<{ category: string; total: number; count: number }>(sql`
    SELECT
      category,
      SUM(amount)::int AS total,
      COUNT(*)::int AS count
    FROM "IncomeTransactions"
    WHERE group_id = ${groupId}
      AND deleted_at IS NULL
      AND occurred_at >= ${monthKey + '-01'}::date
      AND occurred_at <  (${monthKey + '-01'}::date + INTERVAL '1 month')
    GROUP BY category
    ORDER BY total DESC
  `)
  return rows.map((r) => ({ key: r.category, total: r.total, count: r.count }))
}
