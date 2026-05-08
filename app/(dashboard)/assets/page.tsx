import { getCurrentUser } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { oikosGroups } from '@/lib/db/schema'
import { eq, or } from 'drizzle-orm'
import { listAssetsForGroup, getAssetSummariesBatch } from '@/lib/db/queries/asset'
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

  const childIds = assetRows.filter((a) => a.type === 'child').map((a) => a.id)
  const allIds = assetRows.map((a) => a.id)
  const carRows = assetRows.filter((a) => a.type === 'car')

  // One batched SUM for all asset summaries; nickname lookup; per-car hero
  // stats — all three groups run in parallel (no shared dependencies).
  const [childNicknames, summaries, carStatsList] = await Promise.all([
    getChildNicknames(childIds),
    getAssetSummariesBatch(allIds, group.id),
    Promise.all(
      carRows.map(async (a) => [a.id, await getCarHeroStats(a.id, a.initialOdometer)] as const),
    ),
  ])
  const carStats = new Map(carStatsList)

  const items: AssetsListItem[] = assetRows.map((a) => {
    const summary = summaries.get(a.id) ?? { monthAmount: 0, totalAmount: 0 }
    const base: AssetsListItem = {
      id: a.id,
      type: a.type,
      name: a.name,
      nickname: a.type === 'child' ? (childNicknames.get(a.id) ?? null) : null,
      plate: a.plate,
      monthAmount: summary.monthAmount,
    }
    if (a.type !== 'car') return base
    const heroStats = carStats.get(a.id)!
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
  })

  return <AssetsListClient items={items} />
}
