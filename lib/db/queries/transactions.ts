import { db } from '@/lib/db/client'
import { cashTransactions } from '@/lib/db/schema'
import { and, eq, isNull, desc, sql } from 'drizzle-orm'

export interface TxnRow {
  id: string
  amount: number
  splitType: 'all_mine' | 'all_theirs' | 'half'
  description: string
  category: string
  paidBy: string
  transactedAt: Date
}

/** Fetch most recent N active transactions for a group. */
export async function listRecentTransactions(
  groupId: string,
  limit = 5,
): Promise<TxnRow[]> {
  const rows = await db
    .select({
      id: cashTransactions.id,
      amount: cashTransactions.amount,
      splitType: cashTransactions.splitType,
      description: cashTransactions.description,
      category: cashTransactions.category,
      paidBy: cashTransactions.paidBy,
      transactedAt: cashTransactions.transactedAt,
    })
    .from(cashTransactions)
    .where(and(
      eq(cashTransactions.groupId, groupId),
      isNull(cashTransactions.deletedAt),
    ))
    .orderBy(desc(cashTransactions.transactedAt), desc(cashTransactions.createdAt))
    .limit(limit)
  return rows
}

export interface TxnCursor {
  transactedAt: string  // ISO
  createdAt: string     // ISO
}

export interface TxnRowWithCreatedAt extends TxnRow {
  createdAt: Date
}

/**
 * Page through active transactions (newest first) using a composite (transactedAt, createdAt)
 * cursor to avoid skipping same-day rows. Pass `cursor=null` for the first page.
 */
export async function listTransactionsPaged(
  groupId: string,
  cursor: TxnCursor | null,
  limit = 20,
): Promise<TxnRowWithCreatedAt[]> {
  const baseSelect = {
    id: cashTransactions.id,
    amount: cashTransactions.amount,
    splitType: cashTransactions.splitType,
    description: cashTransactions.description,
    category: cashTransactions.category,
    paidBy: cashTransactions.paidBy,
    transactedAt: cashTransactions.transactedAt,
    createdAt: cashTransactions.createdAt,
  }

  if (!cursor) {
    return db
      .select(baseSelect)
      .from(cashTransactions)
      .where(and(
        eq(cashTransactions.groupId, groupId),
        isNull(cashTransactions.deletedAt),
      ))
      .orderBy(desc(cashTransactions.transactedAt), desc(cashTransactions.createdAt))
      .limit(limit)
  }

  // Tuple comparison: (transacted_at, created_at) < (cursor.t, cursor.c).
  // Pass ISO strings with explicit ::timestamptz casts so Postgres parses them correctly.
  return db
    .select(baseSelect)
    .from(cashTransactions)
    .where(and(
      eq(cashTransactions.groupId, groupId),
      isNull(cashTransactions.deletedAt),
      sql`(${cashTransactions.transactedAt}, ${cashTransactions.createdAt}) < (${cursor.transactedAt}::timestamptz, ${cursor.createdAt}::timestamptz)`,
    ))
    .orderBy(desc(cashTransactions.transactedAt), desc(cashTransactions.createdAt))
    .limit(limit)
}
