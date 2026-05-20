import { db } from '@/lib/db/client'
import { trips, cashTransactions, groupEpochs } from '@/lib/db/schema'
import { and, eq, isNull, sql } from 'drizzle-orm'

export async function listActiveTrips(groupId: string, epochId: string) {
  return await db
    .select()
    .from(trips)
    .where(and(
      eq(trips.groupId, groupId),
      eq(trips.epochId, epochId),
      eq(trips.status, 'active'),
      isNull(trips.deletedAt),
    ))
    .orderBy(trips.startDate)
}

export async function listAllTrips(groupId: string, epochId: string) {
  return await db
    .select()
    .from(trips)
    .where(and(
      eq(trips.groupId, groupId),
      eq(trips.epochId, epochId),
      isNull(trips.deletedAt),
    ))
    .orderBy(sql`${trips.startDate} DESC`)
}

export async function getTripById(id: string) {
  const [t] = await db
    .select()
    .from(trips)
    .where(and(eq(trips.id, id), isNull(trips.deletedAt)))
    .limit(1)
  return t ?? null
}

export async function hasActiveTrip(groupId: string, epochId: string): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(trips)
    .where(and(
      eq(trips.groupId, groupId),
      eq(trips.epochId, epochId),
      eq(trips.status, 'active'),
      isNull(trips.deletedAt),
    ))
  return Number(row.n) > 0
}

/**
 * Settings → 旅行 row secondary text. Counts trips in the group's current epoch
 * grouped by status. Returns `{ active: 0, past: 0 }` if the group has no open
 * epoch (shouldn't normally happen — kept defensive so settings still renders).
 */
export async function getTripSummary(groupId: string): Promise<{ active: number; past: number }> {
  const [currentEpoch] = await db
    .select({ id: groupEpochs.id })
    .from(groupEpochs)
    .where(and(eq(groupEpochs.groupId, groupId), isNull(groupEpochs.endedAt)))
    .limit(1)
  if (!currentEpoch) return { active: 0, past: 0 }

  const [row] = await db
    .select({
      active: sql<number>`count(*) FILTER (WHERE ${trips.status} = 'active')::int`,
      past: sql<number>`count(*) FILTER (WHERE ${trips.status} <> 'active')::int`,
    })
    .from(trips)
    .where(and(
      eq(trips.groupId, groupId),
      eq(trips.epochId, currentEpoch.id),
      isNull(trips.deletedAt),
    ))
  return {
    active: Number(row?.active ?? 0),
    past: Number(row?.past ?? 0),
  }
}

export async function listTripRecords(tripId: string) {
  return await db
    .select()
    .from(cashTransactions)
    .where(and(
      eq(cashTransactions.tripId, tripId),
      isNull(cashTransactions.deletedAt),
    ))
    .orderBy(sql`${cashTransactions.transactedAt} DESC`)
}
