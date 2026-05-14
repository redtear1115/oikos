'use server'

import { db } from '@/lib/db/client'
import { trips, groupEpochs } from '@/lib/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import type { CurrencyCode } from '@/lib/currency'
import { requireViewerGroup } from '@/lib/auth/viewer'
import { revalidatePath } from 'next/cache'

export interface CreateTripInput {
  name: string
  startDate: string  // ISO 'YYYY-MM-DD'
  endDate?: string | null
  defaultCurrency?: CurrencyCode | null
  budgetAmount?: number | null
  budgetCurrency?: CurrencyCode | null
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

  const [inserted] = await db
    .insert(trips)
    .values({
      groupId: group.id,
      epochId: currentEpoch.id,
      name,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      defaultCurrency: input.defaultCurrency ?? null,
      budgetAmount: input.budgetAmount ?? null,
      budgetCurrency: input.budgetCurrency ?? null,
      status: 'active',
    })
    .returning()

  revalidatePath('/trips')
  return inserted
}

export async function endTrip(input: { tripId: string; endDate: string }) {
  const { group } = await requireViewerGroup()
  const [updated] = await db
    .update(trips)
    .set({
      status: 'ended',
      endDate: input.endDate,
      endedAt: new Date(),
    })
    .where(and(eq(trips.id, input.tripId), eq(trips.groupId, group.id)))
    .returning()
  if (!updated) throw new Error('找不到旅行')

  revalidatePath('/trips')
  revalidatePath(`/trips/${input.tripId}`)
  return updated
}

export async function updateTrip(input: {
  tripId: string
  name?: string
  startDate?: string
  endDate?: string | null
  defaultCurrency?: CurrencyCode | null
  budgetAmount?: number | null
  budgetCurrency?: CurrencyCode | null
}) {
  const { group } = await requireViewerGroup()
  const epochStartDate = group.currentEpochStartedAt.toISOString().slice(0, 10)
  if (input.startDate && input.startDate < epochStartDate) {
    throw new Error('不可移動至過去章節')
  }
  const { tripId, ...patch } = input
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
