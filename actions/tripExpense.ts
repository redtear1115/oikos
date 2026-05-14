'use server'

import { db } from '@/lib/db/client'
import { tripExpenses, trips } from '@/lib/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { requireViewerGroup } from '@/lib/auth/viewer'
import { revalidatePath } from 'next/cache'
import { convertAmount, type CurrencyCode } from '@/lib/currency'

/**
 * v0.17.2 #42 — Trip sub-ledger actions.
 *
 * Writes go to the isolated TripExpenses table. The main ledger
 * (CashTransactions) is untouched — GroupBalance does not move when trip
 * expenses are added. On trip end (Phase 4), a summary CashTransaction is
 * written to fold the trip back into the main ledger.
 */

export type TripSplitType = 'all_mine' | 'all_theirs' | 'half' | 'weighted'

export interface CreateTripExpenseInput {
  tripId: string
  paidBy: string
  amount: number               // in `currency` units (post-cent for USD)
  currency?: CurrencyCode | null  // null = group base currency
  category: string
  splitType: TripSplitType
  splitRatio?: number | null   // 0–100, payer's share %. Required iff splitType='weighted'.
  description?: string | null
  transactedAt?: string        // ISO timestamp; default = now
}

export interface EditTripExpenseInput extends CreateTripExpenseInput {
  id: string
}

async function loadActiveTripForViewer(tripId: string, groupId: string) {
  const [trip] = await db
    .select()
    .from(trips)
    .where(and(
      eq(trips.id, tripId),
      eq(trips.groupId, groupId),
      isNull(trips.deletedAt),
    ))
    .limit(1)
  if (!trip) throw new Error('找不到旅行')
  if (trip.status !== 'active') throw new Error('旅行已結束，無法修改紀錄')
  return trip
}

interface NormalizedAmount {
  amount: number                            // base currency integer
  originalCurrency: CurrencyCode | null
  originalAmount: number | null
}

function normalizeAmount(
  input: { amount: number; currency: CurrencyCode | null | undefined },
  base: CurrencyCode,
  rateSnapshot: unknown,
): NormalizedAmount {
  const inputCurrency = input.currency ?? base
  if (inputCurrency === base) {
    return { amount: input.amount, originalCurrency: null, originalAmount: null }
  }
  const snapshot = rateSnapshot as Record<string, number> | null
  const key = `${inputCurrency.toUpperCase()}_${base.toUpperCase()}`
  const rate = snapshot?.[key]
  if (rate == null) {
    throw new Error(`旅行匯率 snapshot 缺少 ${inputCurrency} → ${base}`)
  }
  return {
    amount: convertAmount({ amount: input.amount, from: inputCurrency, to: base, rate }),
    originalCurrency: inputCurrency,
    originalAmount: input.amount,
  }
}

function validateCommon(input: CreateTripExpenseInput, group: { memberA: string; memberB: string | null }) {
  if (input.paidBy !== group.memberA && input.paidBy !== group.memberB) {
    throw new Error('付款人不在帳本中')
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('金額需大於 0')
  }
  if (!input.category.trim()) {
    throw new Error('分類為空')
  }
  if (input.splitType === 'weighted') {
    if (input.splitRatio == null) throw new Error('依比例分需要指定比例')
    if (input.splitRatio < 0 || input.splitRatio > 100) throw new Error('比例需在 0–100 之間')
  } else if (input.splitRatio != null) {
    throw new Error('split_ratio 僅適用於依比例分')
  }
}

export async function createTripExpense(input: CreateTripExpenseInput) {
  const { group } = await requireViewerGroup()
  const trip = await loadActiveTripForViewer(input.tripId, group.id)
  validateCommon(input, group)

  const normalized = normalizeAmount(
    { amount: input.amount, currency: input.currency },
    group.baseCurrency,
    trip.rateSnapshot,
  )

  const [inserted] = await db
    .insert(tripExpenses)
    .values({
      tripId: trip.id,
      paidBy: input.paidBy,
      amount: normalized.amount,
      originalCurrency: normalized.originalCurrency,
      originalAmount: normalized.originalAmount,
      category: input.category,
      splitType: input.splitType,
      splitRatio: input.splitRatio ?? null,
      description: input.description?.trim() ? input.description.trim() : null,
      transactedAt: input.transactedAt ? new Date(input.transactedAt) : new Date(),
    })
    .returning()

  revalidatePath(`/trips/${trip.id}`)
  return inserted
}

export async function editTripExpense(input: EditTripExpenseInput) {
  const { group } = await requireViewerGroup()
  const trip = await loadActiveTripForViewer(input.tripId, group.id)
  validateCommon(input, group)

  const normalized = normalizeAmount(
    { amount: input.amount, currency: input.currency },
    group.baseCurrency,
    trip.rateSnapshot,
  )

  const inserted = await db.transaction(async (tx) => {
    const deleted = await tx
      .update(tripExpenses)
      .set({ deletedAt: new Date() })
      .where(and(
        eq(tripExpenses.id, input.id),
        eq(tripExpenses.tripId, trip.id),
        isNull(tripExpenses.deletedAt),
      ))
      .returning({ id: tripExpenses.id })
    if (deleted.length === 0) {
      throw new Error('紀錄已被刪除或不存在')
    }

    const [row] = await tx
      .insert(tripExpenses)
      .values({
        tripId: trip.id,
        paidBy: input.paidBy,
        amount: normalized.amount,
        originalCurrency: normalized.originalCurrency,
        originalAmount: normalized.originalAmount,
        category: input.category,
        splitType: input.splitType,
        splitRatio: input.splitRatio ?? null,
        description: input.description?.trim() ? input.description.trim() : null,
        transactedAt: input.transactedAt ? new Date(input.transactedAt) : new Date(),
      })
      .returning()
    return row
  })

  revalidatePath(`/trips/${trip.id}`)
  return inserted
}

export async function softDeleteTripExpense(input: { id: string; tripId: string }) {
  const { group } = await requireViewerGroup()
  const trip = await loadActiveTripForViewer(input.tripId, group.id)

  const deleted = await db
    .update(tripExpenses)
    .set({ deletedAt: new Date() })
    .where(and(
      eq(tripExpenses.id, input.id),
      eq(tripExpenses.tripId, trip.id),
      isNull(tripExpenses.deletedAt),
    ))
    .returning({ id: tripExpenses.id })
  if (deleted.length === 0) throw new Error('紀錄已被刪除或不存在')

  revalidatePath(`/trips/${trip.id}`)
}
