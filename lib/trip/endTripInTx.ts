import { and, eq, isNull, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { cashTransactions, tripExpenses } from '@/lib/db/schema'
import { recalcGroupBalance } from '@/lib/db/queries/balance'
import { buildTripSummaries } from '@/lib/tripSummary'

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

export interface FoldTripArgs {
  /** The trip, already set to `ended` in this transaction. */
  trip: { id: string; name: string; groupId: string }
  /**
   * The members of the chapter the trip belongs to, read inside this
   * transaction after its locks. They decide how the summary rows split.
   */
  members: { memberA: string; memberB: string | null }
  /** `transacted_at` of the summary rows (the moment the trip ended). */
  transactedAt: Date | SQL
  /**
   * `created_at` of the summary rows. Omitted: the column default (`now()`,
   * the transaction's start), which is what endTrip relies on — its chapter
   * lock makes any closer read its boundary after this commits.
   *
   * A chapter closer that ends the trip itself (acceptInvite, #1438) passes a
   * value derived from its boundary, so the rows are in the closing chapter
   * by construction rather than by comparing two clock reads.
   */
  createdAt?: SQL
}

/**
 * The ledger half of ending a trip, run inside the caller's transaction:
 * fold the trip's expenses into the main ledger as 0–2 summary
 * CashTransactions (see lib/tripSummary.ts for the split math) and, when any
 * were written, recompute the group's balance.
 *
 * Callers own everything around it: the trip row lock and the status UPDATE,
 * the open-chapter check, and which members apply. Used by endTrip and by
 * acceptInvite, which ends the inviter's active trip before closing their
 * solo chapter (#1438).
 *
 * Multi-currency trips need nothing extra here: `TripExpenses.amount` is
 * already the base-currency integer (converted at write time), so the sum is
 * in the ledger's currency. A trip with no live expenses writes no rows and
 * leaves the balance alone.
 */
export async function foldTripIntoLedger(
  tx: DbTransaction,
  args: FoldTripArgs,
): Promise<{ expenseCount: number; summaryCount: number }> {
  const { trip, members } = args

  const expenses = await tx
    .select({
      amount: tripExpenses.amount,
      paidBy: tripExpenses.paidBy,
      splitType: tripExpenses.splitType,
      splitRatio: tripExpenses.splitRatio,
    })
    .from(tripExpenses)
    .where(and(
      eq(tripExpenses.tripId, trip.id),
      isNull(tripExpenses.deletedAt),
    ))

  const summaries = buildTripSummaries({
    expenses,
    memberA: members.memberA,
    memberB: members.memberB,
  })

  if (summaries.length > 0) {
    await tx.insert(cashTransactions).values(summaries.map((s) => ({
      groupId: trip.groupId,
      paidBy: s.paidBy,
      amount: s.amount,
      splitType: s.splitType,
      splitRatioA: s.splitRatioA,
      description: `${trip.name} 結算`,
      category: 'entertainment',
      status: 'settled' as const,
      transactedAt: args.transactedAt,
      tripId: trip.id,
      ...(args.createdAt ? { createdAt: args.createdAt } : {}),
    })))
    await recalcGroupBalance(trip.groupId, tx)
  }

  return { expenseCount: expenses.length, summaryCount: summaries.length }
}
