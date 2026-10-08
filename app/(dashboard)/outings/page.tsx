import { requireViewerGroupOrRedirect } from '@/lib/auth/viewer'
import { db } from '@/lib/db/client'
import { groupEpochs } from '@/lib/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { listOutings } from '@/lib/db/queries/outing'
import { listParticipatingOutings } from '@/lib/db/queries/outingPublic'
import { getLocale } from '@/lib/i18n/t'
import { OutingList } from './_components/OutingList'

export default async function OutingsPage() {
  const { user, group } = await requireViewerGroupOrRedirect()
  const [currentEpoch] = await db
    .select()
    .from(groupEpochs)
    .where(and(eq(groupEpochs.groupId, group.id), isNull(groupEpochs.endedAt)))
    .limit(1)
  if (!currentEpoch) throw new Error('找不到當前章節')

  const [outings, participating, locale] = await Promise.all([
    listOutings(group.id, currentEpoch.id),
    // 我參與的出遊 (#1558): other ledgers' outings this account is bound to.
    // The query already leaves out every outing of a ledger the user is a
    // member of, so nothing here repeats the list above.
    listParticipatingOutings(user.id),
    getLocale(),
  ])
  return (
    <OutingList
      outings={outings}
      participating={participating.map((o) => ({
        id: o.id,
        name: o.name,
        ended: o.status !== 'active',
        href: `/${locale}/outing/r/${o.id}`,
      }))}
    />
  )
}
