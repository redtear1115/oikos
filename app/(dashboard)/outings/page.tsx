import { requireViewerGroupOrRedirect } from '@/lib/auth/viewer'
import { db } from '@/lib/db/client'
import { groupEpochs } from '@/lib/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { listOutings } from '@/lib/db/queries/outing'
import { OutingList } from './_components/OutingList'

export default async function OutingsPage() {
  const { group } = await requireViewerGroupOrRedirect()
  const [currentEpoch] = await db
    .select()
    .from(groupEpochs)
    .where(and(eq(groupEpochs.groupId, group.id), isNull(groupEpochs.endedAt)))
    .limit(1)
  if (!currentEpoch) throw new Error('找不到當前章節')

  const outings = await listOutings(group.id, currentEpoch.id)
  return <OutingList outings={outings} />
}
