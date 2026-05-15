import { db } from '@/lib/db/client'
import { tripExpenses } from '@/lib/db/schema'
import { and, eq, isNull, desc } from 'drizzle-orm'

/**
 * v0.17.2 #42 — Trip sub-ledger queries.
 *
 * Reads from the isolated TripExpenses table. Main ledger queries (records,
 * stats, balance) go through lib/db/queries/transactions.ts and never touch
 * this file — that's the natural isolation that makes the architecture work.
 */

export async function listTripExpenses(tripId: string) {
  return db
    .select()
    .from(tripExpenses)
    .where(and(eq(tripExpenses.tripId, tripId), isNull(tripExpenses.deletedAt)))
    .orderBy(desc(tripExpenses.transactedAt))
}

export async function getTripExpenseById(id: string) {
  const [row] = await db
    .select()
    .from(tripExpenses)
    .where(and(eq(tripExpenses.id, id), isNull(tripExpenses.deletedAt)))
    .limit(1)
  return row ?? null
}
