'use server'

import { db } from '@/lib/db/client'
import { trips, groupEpochs, tripExpenses, cashTransactions } from '@/lib/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { recalcGroupBalance } from '@/lib/db/queries/balance'
import { buildTripSummaries } from '@/lib/tripSummary'
import { requireViewerGroup } from '@/lib/auth/viewer'
import {
  validateTripCurrencySnapshot,
  type TripCurrencySnapshot,
} from '@/lib/trip-currency'
import { revalidatePath } from 'next/cache'
import { captureServer } from '@/lib/analytics/server'

/**
 * Build the rate_snapshot for a fresh trip. The default currency is always the
 * group's `base_currency` (the trip-level default picker was removed — see
 * #410 follow-up). When `explicit` is provided, its `default` field is ignored
 * and overridden to `baseCurrency`; a base entry with rate=1 is auto-inserted
 * if missing. When omitted, we emit a trivial single-entry snapshot with base.
 */
function resolveRateSnapshot(
  baseCurrency: string,
  explicit: TripCurrencySnapshot | undefined,
): TripCurrencySnapshot {
  const base = baseCurrency.toUpperCase()
  if (explicit) return validateTripCurrencySnapshot(explicit, base)
  return { default: base, entries: [{ code: base, label: null, rate: 1 }] }
}

export interface CreateTripInput {
  name: string
  startDate: string  // ISO 'YYYY-MM-DD'
  endDate?: string | null
  budgetAmount?: number | null
  budgetCurrency?: string | null
  /**
   * Explicit currency / rate selection from the TripSheet UI. The `default`
   * field, if present, is ignored — the trip's default always equals the
   * group's base currency. When omitted, the trip starts as base-only.
   */
  currencies?: TripCurrencySnapshot
}

export async function createTrip(input: CreateTripInput) {
  const { user, group } = await requireViewerGroup()

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

  const rateSnapshot = resolveRateSnapshot(group.baseCurrency, input.currencies)

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

  // Feature-adoption signal (#814).
  await captureServer(user.id, 'trip_created', {
    default_currency: inserted.defaultCurrency,
  })

  return inserted
}

export async function endTrip(input: { tripId: string; endDate: string }) {
  const { user, group } = await requireViewerGroup()

  const txResult = await db.transaction(async (tx) => {
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

    return { row, expenseCount: expenses.length }
  })

  revalidatePath('/trips')
  revalidatePath(`/trips/${input.tripId}`)
  revalidatePath('/dashboard')
  revalidatePath('/records')

  // Feature-adoption signal (#814): trip duration and scale.
  const { row: updated, expenseCount } = txResult
  const startMs = new Date(updated.startDate).getTime()
  const endMs = new Date(input.endDate).getTime()
  const durationDays = Math.max(0, Math.round((endMs - startMs) / 86_400_000))
  await captureServer(user.id, 'trip_ended', {
    default_currency: updated.defaultCurrency,
    expense_count: expenseCount,
    duration_days: durationDays,
  })

  return updated
}

export async function updateTrip(input: {
  tripId: string
  name?: string
  startDate?: string
  endDate?: string | null
  budgetAmount?: number | null
  budgetCurrency?: string | null
  /**
   * When provided, replaces the trip's rate_snapshot. The default is always
   * forced to `group.base_currency` (the trip-level default picker was removed
   * — see #410 follow-up). Rates can be edited mid-trip; existing
   * TripExpenses.amount stays as already-stored base integers, so editing
   * rates only affects future records.
   */
  currencies?: TripCurrencySnapshot
}) {
  const { group } = await requireViewerGroup()
  const epochStartDate = group.currentEpochStartedAt.toISOString().slice(0, 10)
  if (input.startDate && input.startDate < epochStartDate) {
    throw new Error('不可移動至過去章節')
  }

  const [existing] = await db
    .select()
    .from(trips)
    .where(and(eq(trips.id, input.tripId), eq(trips.groupId, group.id)))
    .limit(1)
  if (!existing) throw new Error('找不到旅行')

  const { tripId, budgetCurrency, currencies, ...rest } = input
  const patch: Record<string, unknown> = { ...rest }
  if (budgetCurrency !== undefined) {
    patch.budgetCurrency = budgetCurrency ? budgetCurrency.toUpperCase() : null
  }

  if (currencies !== undefined) {
    // validateTripCurrencySnapshot ensures default = base, base entry exists,
    // and rates are positive. We don't enforce a used-currency rate lock any
    // more — rate edits only affect future writes; historical TripExpenses.amount
    // (base integer) stays as-is.
    const validated = validateTripCurrencySnapshot(currencies, group.baseCurrency)
    patch.rateSnapshot = validated
    patch.defaultCurrency = validated.default
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
