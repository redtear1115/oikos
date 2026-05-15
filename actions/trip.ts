'use server'

import { db } from '@/lib/db/client'
import { trips, groupEpochs, tripExpenses, cashTransactions } from '@/lib/db/schema'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { recalcGroupBalance } from '@/lib/db/queries/balance'
import { buildTripSummaries } from '@/lib/tripSummary'
import { requireViewerGroup } from '@/lib/auth/viewer'
import {
  parseTripCurrencySnapshot,
  validateTripCurrencySnapshot,
  type TripCurrencySnapshot,
} from '@/lib/trip-currency'
import { revalidatePath } from 'next/cache'

/**
 * Build the rate_snapshot for a fresh trip. The caller passes an explicit
 * currencies payload (the new TripSheet UI); when omitted we degrade to a
 * trivial single-entry snapshot whose only currency is the trip's `default`
 * (which itself defaults to the group's base currency). This keeps single-
 * currency trips simple and removes the prior dependency on the deprecated
 * CurrencyRates table.
 */
function resolveRateSnapshot(
  defaultCode: string,
  explicit: TripCurrencySnapshot | undefined,
): TripCurrencySnapshot {
  if (explicit) return validateTripCurrencySnapshot(explicit)
  const def = defaultCode.toUpperCase()
  return { default: def, entries: [{ code: def, label: null, rate: 1 }] }
}

export interface CreateTripInput {
  name: string
  startDate: string  // ISO 'YYYY-MM-DD'
  endDate?: string | null
  defaultCurrency?: string | null
  budgetAmount?: number | null
  budgetCurrency?: string | null
  /**
   * Explicit currency / rate selection from the TripSheet UI. When omitted,
   * the trip is created as a single-currency trip in `defaultCurrency` (or the
   * group's base currency if that's also omitted).
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
  const rateSnapshot = resolveRateSnapshot(defaultCode, input.currencies)

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

const RATE_EPSILON = 1e-6

export async function updateTrip(input: {
  tripId: string
  name?: string
  startDate?: string
  endDate?: string | null
  defaultCurrency?: string | null
  budgetAmount?: number | null
  budgetCurrency?: string | null
  /**
   * When provided, replaces the trip's rate_snapshot. Guards: any currency
   * already used by a TripExpense (incl. the default if expenses exist with
   * NULL original_currency) cannot be removed or have its rate changed, and
   * the default cannot be reassigned while expenses exist.
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

  const { tripId, defaultCurrency, budgetCurrency, currencies, ...rest } = input
  const patch: Record<string, unknown> = { ...rest }
  if (budgetCurrency !== undefined) {
    patch.budgetCurrency = budgetCurrency ? budgetCurrency.toUpperCase() : null
  }

  if (currencies !== undefined) {
    const validated = validateTripCurrencySnapshot(currencies)
    const oldSnap = parseTripCurrencySnapshot(
      existing.rateSnapshot,
      existing.defaultCurrency ?? group.baseCurrency,
    )

    // Determine which currencies have expenses recorded. NULL original_currency
    // means an expense in the OLD default; track that as a "default has expenses" flag.
    const usedCounts = await db
      .select({
        currency: tripExpenses.originalCurrency,
        n: sql<number>`count(*)::int`,
      })
      .from(tripExpenses)
      .where(and(
        eq(tripExpenses.tripId, tripId),
        isNull(tripExpenses.deletedAt),
      ))
      .groupBy(tripExpenses.originalCurrency)

    const usedExplicitCodes = new Set<string>()
    let defaultHasExpenses = false
    for (const row of usedCounts) {
      if (Number(row.n) <= 0) continue
      if (row.currency == null) {
        defaultHasExpenses = true
      } else {
        usedExplicitCodes.add(row.currency.toUpperCase())
      }
    }

    if (defaultHasExpenses && oldSnap.default !== validated.default) {
      throw new Error('預設幣別已有支出紀錄，無法變更')
    }

    const newByCode = new Map(validated.entries.map(e => [e.code, e]))
    const oldByCode = new Map(oldSnap.entries.map(e => [e.code, e]))

    for (const used of usedExplicitCodes) {
      if (!newByCode.has(used)) {
        throw new Error(`${used} 已有支出紀錄，無法移除`)
      }
      const oldEntry = oldByCode.get(used)
      const newEntry = newByCode.get(used)!
      if (oldEntry && Math.abs(oldEntry.rate - newEntry.rate) > RATE_EPSILON) {
        throw new Error(`${used} 已有支出紀錄，無法變更匯率`)
      }
    }

    patch.rateSnapshot = validated
    patch.defaultCurrency = validated.default
  } else if (defaultCurrency !== undefined) {
    // Currencies not supplied — bare defaultCurrency rename. Keep the snapshot
    // structurally intact: just relabel the `default` field if the new default
    // is already an entry; otherwise reject.
    const next = defaultCurrency ? defaultCurrency.toUpperCase() : null
    if (next) {
      const snap = parseTripCurrencySnapshot(
        existing.rateSnapshot,
        existing.defaultCurrency ?? group.baseCurrency,
      )
      if (!snap.entries.some(e => e.code === next)) {
        throw new Error('預設幣別不在幣別列表中')
      }
      patch.defaultCurrency = next
      patch.rateSnapshot = { ...snap, default: next }
    } else {
      patch.defaultCurrency = null
    }
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
