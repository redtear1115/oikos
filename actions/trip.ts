'use server'

import { db } from '@/lib/db/client'
import { trips, groupEpochs, tripExpenses, cashTransactions, oikosGroups } from '@/lib/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { recalcGroupBalance } from '@/lib/db/queries/balance'
import { openEpochClause } from '@/lib/db/queries/_predicates'
import { lockOpenEpochForWrite } from '@/lib/db/queries/epoch'
import { buildTripSummaries } from '@/lib/tripSummary'
import { requireViewerGroup } from '@/lib/auth/viewer'
import { getViewerWriteContext } from '@/lib/actionContext'
import {
  validateTripCurrencySnapshot,
  type TripCurrencySnapshot,
} from '@/lib/trip-currency'
import { revalidatePath } from 'next/cache'
import { captureServer, isUserFirstNonDeletedRecord } from '@/lib/analytics/server'
import { action, actionError } from '@/lib/action-errors'

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

export const createTrip = action(async (input: CreateTripInput) => {
  const { user, group } = await requireViewerGroup()

  const name = input.name.trim()
  if (!name) throw actionError('trip_name_empty')
  if (name.length > 100) throw actionError('trip_name_too_long')

  const epochStartDate = group.currentEpochStartedAt.toISOString().slice(0, 10)
  if (input.startDate < epochStartDate) {
    throw actionError('trip_in_past_epoch')
  }
  if (input.endDate && input.endDate < input.startDate) {
    throw actionError('trip_end_before_start')
  }

  const [currentEpoch] = await db
    .select()
    .from(groupEpochs)
    .where(and(eq(groupEpochs.groupId, group.id), isNull(groupEpochs.endedAt)))
    .limit(1)
  if (!currentEpoch) throw actionError('current_epoch_not_found')

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
})

export const endTrip = action(async (input: { tripId: string; endDate: string }) => {
  const { user, group } = await getViewerWriteContext()

  const txResult = await db.transaction(async (tx) => {
    // Conditional update on status='active' makes this idempotent: a second
    // endTrip on an already-ended trip yields no rows and no summary writes,
    // even if the caller races with itself.
    //
    // `openEpochClause`: only a trip of the chapter that is open now can be
    // ended; a trip whose chapter has closed is part of the read-only past.
    // Fails as `active_trip_not_found`, same as a missing trip.
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
        openEpochClause(trips.epochId, group.id),
      ))
      .returning()
    if (!row) {
      // Either trip doesn't exist in this group, or it's already 'ended'.
      // Surface a single error string — the caller can decide whether the
      // trip is missing or just already closed by checking on the client.
      throw actionError('active_trip_not_found')
    }

    // Trip row (locked by the UPDATE above), then the open chapter row FOR
    // SHARE — see lockOpenEpochForWrite. A chapter close either waits for this
    // transaction, so the summary rows below land before its boundary, or has
    // already closed the trip's chapter, and this is refused (the UPDATE
    // above rolls back with it).
    const openEpoch = await lockOpenEpochForWrite(tx, group.id)
    if (!openEpoch || openEpoch.id !== row.epochId) throw actionError('active_trip_not_found')

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

    // Split with the members as they are inside this transaction, not as
    // they were when the viewer's context was resolved before it.
    const [members] = await tx
      .select({ memberA: oikosGroups.memberA, memberB: oikosGroups.memberB })
      .from(oikosGroups)
      .where(eq(oikosGroups.id, group.id))
      .limit(1)
    if (!members) throw actionError('active_trip_not_found')

    const summaries = buildTripSummaries({
      expenses,
      memberA: members.memberA,
      memberB: members.memberB,
    })

    let firstRecord = false
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
      firstRecord = await isUserFirstNonDeletedRecord(tx, user.id, group.id)
    }

    return { row, expenseCount: expenses.length, firstRecord }
  })

  revalidatePath('/trips')
  revalidatePath(`/trips/${input.tripId}`)
  revalidatePath('/dashboard')
  revalidatePath('/records')

  // Milestone signal (#891, not the activation metric — see #1127): trip-end summary may be viewer's first record.
  if (txResult.firstRecord) {
    await captureServer(user.id, 'first_record_created', { via: 'trip_summary' })
  }

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
})

export interface UpdateTripInput {
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
}

const TRIP_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * The only Trip columns `updateTrip` may write. Server-action arguments are
 * not type-checked at runtime and Drizzle's `.set()` writes every key that
 * matches a column, so the patch is built field by field from `input` —
 * never by spreading it. Ownership and lifecycle columns (group, epoch,
 * status, ended/deleted timestamps, cover photo) belong to their dedicated
 * actions, not to the edit sheet.
 *
 * Failure mode if this regresses: nothing errors and the sheet still works —
 * an extra key in the payload silently rewrites a column the sheet never
 * shows. `tests/actions-trip.test.ts` pins the exact key set of `.set()`.
 */
type TripEditPatch = Partial<Pick<typeof trips.$inferInsert,
  | 'name'
  | 'startDate'
  | 'endDate'
  | 'budgetAmount'
  | 'budgetCurrency'
  | 'rateSnapshot'
  | 'defaultCurrency'
>>

export const updateTrip = action(async (input: UpdateTripInput) => {
  const { group } = await getViewerWriteContext()
  if (!input || typeof input !== 'object' || typeof input.tripId !== 'string' || !input.tripId) {
    throw new Error('Invalid trip update input')
  }
  const tripId = input.tripId
  const patch: TripEditPatch = {}

  if (input.name !== undefined) {
    if (typeof input.name !== 'string') throw new Error('Invalid trip name')
    const name = input.name.trim()
    if (!name) throw actionError('trip_name_empty')
    if (name.length > 100) throw actionError('trip_name_too_long')
    patch.name = name
  }

  if (input.startDate !== undefined) {
    if (typeof input.startDate !== 'string' || !TRIP_DATE_RE.test(input.startDate)) {
      throw new Error('Invalid trip start date')
    }
    patch.startDate = input.startDate
  }

  if (input.endDate !== undefined) {
    if (input.endDate !== null
      && (typeof input.endDate !== 'string' || !TRIP_DATE_RE.test(input.endDate))) {
      throw new Error('Invalid trip end date')
    }
    patch.endDate = input.endDate
  }

  if (input.budgetAmount !== undefined) {
    if (input.budgetAmount !== null
      && (!Number.isInteger(input.budgetAmount) || input.budgetAmount < 0)) {
      throw new Error('Invalid trip budget amount')
    }
    patch.budgetAmount = input.budgetAmount
  }

  if (input.budgetCurrency !== undefined) {
    if (input.budgetCurrency !== null && typeof input.budgetCurrency !== 'string') {
      throw new Error('Invalid trip budget currency')
    }
    patch.budgetCurrency = input.budgetCurrency ? input.budgetCurrency.toUpperCase() : null
  }

  const epochStartDate = group.currentEpochStartedAt.toISOString().slice(0, 10)
  if (patch.startDate && patch.startDate < epochStartDate) {
    throw actionError('trip_move_to_past_epoch')
  }

  // A trip of a closed chapter is read-only: `openEpochClause` makes it
  // `trip_not_found` here and again on the UPDATE below.
  const [existing] = await db
    .select()
    .from(trips)
    .where(and(
      eq(trips.id, tripId),
      eq(trips.groupId, group.id),
      openEpochClause(trips.epochId, group.id),
    ))
    .limit(1)
  if (!existing) throw actionError('trip_not_found')

  // Same rule as createTrip, checked against the merged result so a partial
  // update (only one of the two dates) can't leave end < start either.
  const nextStart = patch.startDate ?? existing.startDate
  const nextEnd = patch.endDate !== undefined ? patch.endDate : existing.endDate
  if (nextEnd && nextStart && nextEnd < nextStart) {
    throw actionError('trip_end_before_start')
  }

  if (input.currencies !== undefined) {
    // validateTripCurrencySnapshot ensures default = base, base entry exists,
    // and rates are positive. We don't enforce a used-currency rate lock any
    // more — rate edits only affect future writes; historical TripExpenses.amount
    // (base integer) stays as-is.
    const validated = validateTripCurrencySnapshot(input.currencies, group.baseCurrency)
    patch.rateSnapshot = validated
    patch.defaultCurrency = validated.default
  }

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(trips)
      .set(patch)
      .where(and(
        eq(trips.id, tripId),
        eq(trips.groupId, group.id),
        openEpochClause(trips.epochId, group.id),
      ))
      .returning()
    if (!row) throw actionError('trip_not_found')
    // Trip row, then the open chapter row: see endTrip.
    const openEpoch = await lockOpenEpochForWrite(tx, group.id)
    if (!openEpoch || openEpoch.id !== row.epochId) throw actionError('trip_not_found')
    return row
  })
  revalidatePath('/trips')
  revalidatePath(`/trips/${tripId}`)
  return updated
})

export const softDeleteTrip = action(async (input: { tripId: string }) => {
  const { group } = await getViewerWriteContext()
  // Same chapter rule as updateTrip. `.returning()` so a refused delete is
  // reported instead of silently matching nothing.
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(trips)
      .set({ deletedAt: new Date() })
      .where(and(
        eq(trips.id, input.tripId),
        eq(trips.groupId, group.id),
        openEpochClause(trips.epochId, group.id),
      ))
      .returning({ id: trips.id, epochId: trips.epochId })
    if (!row) throw actionError('trip_not_found')
    // Trip row, then the open chapter row: see endTrip.
    const openEpoch = await lockOpenEpochForWrite(tx, group.id)
    if (!openEpoch || openEpoch.id !== row.epochId) throw actionError('trip_not_found')
  })
  revalidatePath('/trips')
})
