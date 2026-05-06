import { db } from '@/lib/db/client'
import { incomeTransactions } from '@/lib/db/schema'
import { and, eq, isNull, desc, sql } from 'drizzle-orm'

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
): Promise<IncomeRow[]> {
  const conditions = [
    eq(incomeTransactions.groupId, groupId),
    isNull(incomeTransactions.deletedAt),
  ]
  if (cursor) {
    conditions.push(
      sql`(occurred_at, created_at) < (${cursor.occurredAt}::date, ${cursor.createdAt}::timestamptz)`,
    )
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
