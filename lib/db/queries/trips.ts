import { db } from '@/lib/db/client'
import { trips, cashTransactions } from '@/lib/db/schema'
import { and, eq, isNull, sql } from 'drizzle-orm'

export async function listActiveTrips(groupId: string, epochId: string) {
  return db
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
  return db
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

export async function listTripRecords(tripId: string) {
  return db
    .select()
    .from(cashTransactions)
    .where(and(
      eq(cashTransactions.tripId, tripId),
      isNull(cashTransactions.deletedAt),
    ))
    .orderBy(sql`${cashTransactions.transactedAt} DESC`)
}
