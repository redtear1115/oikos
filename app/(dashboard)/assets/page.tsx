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

  const childIds = assetRows.filter((a) => a.type === 'child').map((a) => a.id)

  // Run nickname lookup in parallel with per-row summary/hero queries — both
  // only depend on assetRows. Per car row, summary + heroStats also run in
  // parallel (independent queries against different tables).
  const [childNicknames, partialItems] = await Promise.all([
    getChildNicknames(childIds),
    Promise.all(
      assetRows.map(async (a) => {
        if (a.type !== 'car') {
          const summary = await getAssetSummary(a.id, group.id)
          return {
            id: a.id,
            type: a.type,
            name: a.name,
            plate: a.plate,
            monthAmount: summary.monthAmount,
          } satisfies Omit<AssetsListItem, 'nickname'>
        }
        const [summary, heroStats] = await Promise.all([
          getAssetSummary(a.id, group.id),
          getCarHeroStats(a.id, a.initialOdometer),
        ])
        return {
          id: a.id,
          type: a.type,
          name: a.name,
          plate: a.plate,
          monthAmount: summary.monthAmount,
          color: a.color,
          year: a.year,
          brand: a.brand,
          model: a.model,
          latestOdometer: heroStats.latestOdometer,
          totalAmount: summary.totalAmount,
          avgFuelEcon: heroStats.avgFuelEcon,
        } satisfies Omit<AssetsListItem, 'nickname'>
      }),
    ),
  ])

  const items: AssetsListItem[] = partialItems.map((i) => ({
    ...i,
    nickname: i.type === 'child' ? (childNicknames.get(i.id) ?? null) : null,
  }))

  return <AssetsListClient items={items} />
}
