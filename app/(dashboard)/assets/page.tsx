import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { oikosGroups } from '@/lib/db/schema'
import { eq, or } from 'drizzle-orm'
import { listAssetsForGroup, getAssetSummary } from '@/lib/db/queries/asset'
import { AssetsListClient, type AssetsListItem } from './_components/AssetsListClient'

export default async function AssetsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const [group] = await db
    .select()
    .from(oikosGroups)
    .where(or(eq(oikosGroups.memberA, user.id), eq(oikosGroups.memberB, user.id)))
    .limit(1)
  if (!group) throw new Error('No group')

  const assetRows = await listAssetsForGroup(group.id)

  // Fetch month summary for each asset (parallel). N is small (1-2 cars in
  // friend test), so per-row queries are fine; if N grows we'll batch.
  const items: AssetsListItem[] = await Promise.all(
    assetRows.map(async (a) => {
      const summary = await getAssetSummary(a.id, group.id)
      return {
        id: a.id,
        type: a.type,
        name: a.name,
        plate: a.plate,
        monthAmount: summary.monthAmount,
      }
    }),
  )

  return <AssetsListClient items={items} />
}
