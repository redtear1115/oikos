'use server'

import { db } from '@/lib/db/client'
import { trips, groupEpochs, tripExpenses, cashTransactions } from '@/lib/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { listRatesForGroup } from '@/lib/db/queries/currencyRates'
import { recalcGroupBalance } from '@/lib/db/queries/balance'
import { buildTripSummaries } from '@/lib/tripSummary'
import { requireViewerGroup } from '@/lib/auth/viewer'
import {
  buildSnapshotFromCurrencyRates,
  validateTripCurrencySnapshot,
  type TripCurrencySnapshot,
} from '@/lib/trip-currency'
import { revalidatePath } from 'next/cache'

/**
 * Build the new-shape rate_snapshot for a fresh trip.
 *
 * Two paths:
 *   - If the caller supplied an explicit `currencies` snapshot (new TripSheet
 *     UI in v0.17.4+), validate + use it directly. This is the long-term path.
 *   - Otherwise, fall back to deriving from the legacy per-group CurrencyRates
 *     table. Preserves behaviour for any client still on the pre-v0.17.4
 *     single-default-currency form.
 */
async function resolveRateSnapshot(
  groupId: string,
  defaultCode: string,
  explicit: TripCurrencySnapshot | undefined,
): Promise<TripCurrencySnapshot> {
  if (explicit) return validateTripCurrencySnapshot(explicit)
  const rates = await listRatesForGroup(groupId)
  return buildSnapshotFromCurrencyRates(rates, defaultCode)
}

export interface CreateTripInput {
  name: string
  startDate: string  // ISO 'YYYY-MM-DD'
  endDate?: string | null
  defaultCurrency?: string | null
  budgetAmount?: number | null
  budgetCurrency?: string | null
  /**
   * Explicit currency / rate selection from the new TripSheet UI. When omitted,
   * createTrip falls back to deriving the snapshot from the group's legacy
   * CurrencyRates table.
   */
  currencies?: TripCurrencySnapshot
}

export async function createTrip(input: CreateTripInput) {
  const { group } = await requireViewerGroup()

  const name = input.name.trim()
  if (!name) throw new Error('旅行名稱為空')
  if (name.length > 100) throw new Error('旅行名稱過長')

  const epochStartDate = group.currentEpochStartedAt.toISOString().slice(0, 10)
  if (input.startDate < epochStartDate) {
    throw new Error('不可建在過去章節')
  }
  if (input.endDate && input.endDate < input.startDate) {
    throw new Error('結束日期不可早於起始日')
  }

  const [currentEpoch] = await db
    .select()
    .from(groupEpochs)
    .where(and(eq(groupEpochs.groupId, group.id), isNull(groupEpochs.endedAt)))
    .limit(1)
  if (!currentEpoch) throw new Error('找不到當前章節')

  const defaultCode = (input.defaultCurrency ?? group.baseCurrency).toUpperCase()
  const rateSnapshot = await resolveRateSnapshot(group.id, defaultCode, input.currencies)

  const [inserted] = await db
    .insert(trips)
    .values({
      groupId: group.id,
      epochId: currentEpoch.id,
      name,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      defaultCurrency: rateSnapshot.default,
      budgetAmount: input.budgetAmount ?? null,
      budgetCurrency: input.budgetCurrency ? input.budgetCurrency.toUpperCase() : null,
      status: 'active',
      rateSnapshot,
    })
    .returning()

  revalidatePath('/trips')
  return inserted
}

export async function endTrip(input: { tripId: string; endDate: string }) {
  const { group } = await requireViewerGroup()

  const updated = await db.transaction(async (tx) => {
    // Conditional update on status='active' makes this idempotent: a second
    // endTrip on an already-ended trip yields no rows and no summary writes,
    // even if the caller races with itself.
    const [row] = await tx
      .update(trips)
      .set({
        status: 'ended',
        endDate: input.endDate,
        endedAt: new Date(),
      })
      .where(and(
        eq(trips.id, input.tripId),
        eq(trips.groupId, group.id),
        eq(trips.status, 'active'),
      ))
      .returning()
    if (!row) {
      // Either trip doesn't exist in this group, or it's already 'ended'.
      // Surface a single error string — the caller can decide whether the
      // trip is missing or just already closed by checking on the client.
      throw new Error('找不到進行中的旅行')
    }

    // Fold the isolated trip ledger into the main ledger via 0–2 summary
    // CashTransactions. recalcGroupBalance picks them up alongside existing
    // settled rows. See lib/tripSummary.ts for the splitRatioA math.
    const expenses = await tx
      .select({
        amount: tripExpenses.amount,
        paidBy: tripExpenses.paidBy,
        splitType: tripExpenses.splitType,
        splitRatio: tripExpenses.splitRatio,
      })
      .from(tripExpenses)
      .where(and(
        eq(tripExpenses.tripId, input.tripId),
        isNull(tripExpenses.deletedAt),
      ))

    const summaries = buildTripSummaries({
      expenses,
      memberA: group.memberA,
      memberB: group.memberB,
    })

    if (summaries.length > 0) {
      const endedAt = row.endedAt ?? new Date()
      await tx.insert(cashTransactions).values(summaries.map((s) => ({
        groupId: group.id,
        paidBy: s.paidBy,
        amount: s.amount,
        splitType: s.splitType,
        splitRatioA: s.splitRatioA,
        description: `${row.name} 結算`,
        category: 'entertainment',
        status: 'settled' as const,
        transactedAt: endedAt,
        tripId: row.id,
      })))
      await recalcGroupBalance(group.id, tx)
    }

    return row
  })

  revalidatePath('/trips')
  revalidatePath(`/trips/${input.tripId}`)
  revalidatePath('/dashboard')
  revalidatePath('/records')
  return updated
}

export async function updateTrip(input: {
  tripId: string
  name?: string
  startDate?: string
  endDate?: string | null
  defaultCurrency?: string | null
  budgetAmount?: number | null
  budgetCurrency?: string | null
}) {
  const { group } = await requireViewerGroup()
  const epochStartDate = group.currentEpochStartedAt.toISOString().slice(0, 10)
  if (input.startDate && input.startDate < epochStartDate) {
    throw new Error('不可移動至過去章節')
  }
  const { tripId, defaultCurrency, budgetCurrency, ...rest } = input
  const patch: Record<string, unknown> = { ...rest }
  if (defaultCurrency !== undefined) {
    patch.defaultCurrency = defaultCurrency ? defaultCurrency.toUpperCase() : null
  }
  if (budgetCurrency !== undefined) {
    patch.budgetCurrency = budgetCurrency ? budgetCurrency.toUpperCase() : null
  }
  const [updated] = await db
    .update(trips)
    .set(patch)
    .where(and(eq(trips.id, tripId), eq(trips.groupId, group.id)))
    .returning()
  if (!updated) throw new Error('找不到旅行')
  revalidatePath('/trips')
  revalidatePath(`/trips/${tripId}`)
  return updated
}

export async function softDeleteTrip(input: { tripId: string }) {
  const { group } = await requireViewerGroup()
  await db
    .update(trips)
    .set({ deletedAt: new Date() })
    .where(and(eq(trips.id, input.tripId), eq(trips.groupId, group.id)))
  revalidatePath('/trips')
}
