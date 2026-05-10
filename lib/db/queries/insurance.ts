import { db } from '@/lib/db/client'
import { incomeTransactions } from '@/lib/db/schema'
import { and, eq, isNull, desc, inArray, sql } from 'drizzle-orm'
import type { IncomeRow, IncomeCursor } from './incomes'

/**
 * Sum + count of active CashTransactions linked to a specific insurance asset
 * (i.e. premium payments). Used by SavingsView's pay-side bar / stats.
 */
export async function getInsurancePaymentTotal(
  assetId: string,
  groupId: string,
): Promise<{ total: number; count: number }> {
  const [row] = await db.execute<{ total: string; count: string }>(sql`
    SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
    FROM "CashTransactions"
    WHERE asset_id = ${assetId}
      AND group_id = ${groupId}
      AND deleted_at IS NULL
  `)
  return { total: parseInt(row.total, 10), count: parseInt(row.count, 10) }
}

/**
 * Sum + count of active IncomeTransactions linked to a specific insurance
 * asset, filtered by category. SavingsView passes `['maturity']`.
 */
export async function getInsuranceReturnTotal(
  assetId: string,
  groupId: string,
  categories: string[],
): Promise<{ total: number; count: number }> {
  if (categories.length === 0) return { total: 0, count: 0 }

  const rows = await db
    .select({
      total: sql<string>`COALESCE(SUM(amount), 0)`,
      count: sql<string>`COUNT(*)`,
    })
    .from(incomeTransactions)
    .where(and(
      eq(incomeTransactions.assetId, assetId),
      eq(incomeTransactions.groupId, groupId),
      isNull(incomeTransactions.deletedAt),
      inArray(incomeTransactions.category, categories),
    ))
  const r = rows[0]
  return { total: parseInt(r.total, 10), count: parseInt(r.count, 10) }
}

/**
 * Page through IncomeTransactions linked to an insurance asset (newest first),
 * filtered by category. Mirrors listIncomesPaged but scoped per-asset.
 */
export async function listInsuranceReturnsPaged(
  assetId: string,
  groupId: string,
  categories: string[],
  cursor: IncomeCursor | null,
  limit = 20,
): Promise<IncomeRow[]> {
  if (categories.length === 0) return []

  const conditions = [
    eq(incomeTransactions.assetId, assetId),
    eq(incomeTransactions.groupId, groupId),
    isNull(incomeTransactions.deletedAt),
    inArray(incomeTransactions.category, categories),
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

/**
 * Page through CashTransactions for an insurance asset. Thin wrapper to keep
 * SavingsView's data dependencies in one place; under the hood reuses the
 * generic asset transaction loader.
 */
export async function listInsurancePaymentsPaged(
  assetId: string,
  groupId: string,
  cursor: { transactedAt: string; createdAt: string } | null,
  limit = 20,
) {
  const cursorClause = cursor
    ? sql`AND (transacted_at, created_at) < (${cursor.transactedAt}::timestamptz, ${cursor.createdAt}::timestamptz)`
    : sql``

  const rows = await db.execute<{
    id: string
    amount: number
    split_type: 'all_mine' | 'all_theirs' | 'half'
    split_ratio_a: number | null
    description: string
    category: string
    paid_by: string
    asset_id: string | null
    fuel_log_id: string | null
    notes: string | null
    transacted_at: Date | string
    created_at: Date | string
  }>(sql`
    SELECT
      id, amount, split_type, split_ratio_a, description, category, paid_by,
      asset_id, fuel_log_id, notes, transacted_at, created_at
    FROM "CashTransactions"
    WHERE asset_id = ${assetId}
      AND group_id = ${groupId}
      AND deleted_at IS NULL
      ${cursorClause}
    ORDER BY transacted_at DESC, created_at DESC
    LIMIT ${limit}
  `)

  return rows.map((r) => ({
    id: r.id,
    amount: r.amount,
    splitType: r.split_type,
    splitRatioA: r.split_ratio_a ?? null,
    description: r.description,
    category: r.category,
    paidBy: r.paid_by,
    assetId: r.asset_id,
    fuelLogId: r.fuel_log_id ?? null,
    notes: r.notes,
    transactedAt: r.transacted_at instanceof Date ? r.transacted_at : new Date(r.transacted_at),
    createdAt: r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
  }))
}

