import { getCurrentUser } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { oikosGroups } from '@/lib/db/schema'
import { eq, or } from 'drizzle-orm'
import { listAssetsForGroup, getAssetSummary } from '@/lib/db/queries/asset'
import { getCarHeroStats } from '@/lib/db/queries/fuelLog'
import { getChildNicknames } from '@/lib/db/queries/aibutsu'
import { AssetsListClient, type AssetsListItem } from './_components/AssetsListClient'

export default async function AssetsPage() {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const [group] = await db
    .select()
    .from(oikosGroups)
    .where(or(eq(oikosGroups.memberA, user.id), eq(oikosGroups.memberB, user.id)))
    .limit(1)
  if (!group) throw new Error('No group')

  const assetRows = await listAssetsForGroup(group.id)

  // Batch nickname lookup for children (used to render nickname-first in list).
  const childIds = assetRows.filter((a) => a.type === 'child').map((a) => a.id)
  const childNicknames = await getChildNicknames(childIds)

  // Fetch month summary for each asset (parallel). N is small (1-2 cars in
  // friend test), so per-row queries are fine; if N grows we'll batch.
  const items: AssetsListItem[] = await Promise.all(
    assetRows.map(async (a) => {
      const summary = await getAssetSummary(a.id, group.id)
      const base: AssetsListItem = {
        id: a.id,
        type: a.type,
        name: a.name,
        nickname: a.type === 'child' ? (childNicknames.get(a.id) ?? null) : null,
        plate: a.plate,
        monthAmount: summary.monthAmount,
      }
      if (a.type !== 'car') return base
      const heroStats = await getCarHeroStats(a.id, a.initialOdometer)
      return {
        ...base,
        color: a.color,
        year: a.year,
        brand: a.brand,
        model: a.model,
        latestOdometer: heroStats.latestOdometer,
        totalAmount: summary.totalAmount,
        avgFuelEcon: heroStats.avgFuelEcon,
      }
    }),
  )

  return <AssetsListClient items={items} />
}
