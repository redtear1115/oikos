import { requireViewerGroupOrRedirect } from '@/lib/auth/viewer'
import { db } from '@/lib/db/client'
import { groupEpochs } from '@/lib/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { listAllTrips } from '@/lib/db/queries/trips'
import { TripList } from './_components/TripList'

export default async function TripsPage() {
  const { group } = await requireViewerGroupOrRedirect()
  const [currentEpoch] = await db
    .select()
    .from(groupEpochs)
    .where(and(eq(groupEpochs.groupId, group.id), isNull(groupEpochs.endedAt)))
    .limit(1)
  if (!currentEpoch) throw new Error('找不到當前章節')

  const trips = await listAllTrips(group.id, currentEpoch.id)
  return <TripList trips={trips} baseCurrency={group.baseCurrency} />
}
