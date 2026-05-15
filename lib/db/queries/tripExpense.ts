import { db } from '@/lib/db/client'
import { tripExpenses } from '@/lib/db/schema'
import { and, eq, isNull, desc, sql } from 'drizzle-orm'

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

/**
 * v0.17.4 #410 — Count TripExpenses per `original_currency` for a trip. Empty-
 * string key represents expenses recorded in the trip's default currency
 * (original_currency = NULL). Used by TripSheet edit mode to lock rates on
 * currencies whose conversion has already been baked into stored amounts.
 */
export async function countTripExpensesByCurrency(tripId: string): Promise<Record<string, number>> {
  const rows = await db
    .select({
      currency: tripExpenses.originalCurrency,
      n: sql<number>`count(*)::int`,
    })
    .from(tripExpenses)
    .where(and(eq(tripExpenses.tripId, tripId), isNull(tripExpenses.deletedAt)))
    .groupBy(tripExpenses.originalCurrency)
  const out: Record<string, number> = {}
  for (const r of rows) {
    out[r.currency ?? ''] = Number(r.n)
  }
  return out
}
