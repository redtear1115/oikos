import { getCurrentUser } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { oikosGroups } from '@/lib/db/schema'
import { eq, or } from 'drizzle-orm'
import { listAssetsForGroup, getAssetSummariesBatch } from '@/lib/db/queries/asset'
import { resolveViewerEpochWindow } from '@/lib/db/queries/epoch'
import { getActiveGroupForUser } from '@/lib/db/queries/group'
import { getCarHeroStats } from '@/lib/db/queries/fuelLog'
import { getChildNicknames } from '@/lib/db/queries/aibutsu'
import { AssetsListClient, type AssetsListItem } from './_components/AssetsListClient'

export default async function AssetsPage() {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const group = await getActiveGroupForUser(user.id)
  if (!group) throw new Error('No group')

  const epochWindow = await resolveViewerEpochWindow(group.id)
  const assetRows = await listAssetsForGroup(group.id)

  const childIds = assetRows.filter((a) => a.type === 'child').map((a) => a.id)
  const allIds = assetRows.map((a) => a.id)
  const carRows = assetRows.filter((a) => a.type === 'car')

  // One batched SUM for all asset summaries; nickname lookup; per-car hero
  // stats — all three groups run in parallel (no shared dependencies).
  const [childNicknames, summaries, carStatsList] = await Promise.all([
    getChildNicknames(childIds),
    getAssetSummariesBatch(allIds, group.id, epochWindow),
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
      isSavings: a.type === 'insurance' && a.insuranceType === 'savings',
    }
    if (a.type === 'insurance') {
      base.insurance = {
        insuranceType: a.insuranceType,
        insured: a.insuranceInsured,
        policyHolderUserId: a.insurancePolicyHolderUserId,
        policyHolderDisplayName: a.insurancePolicyHolderDisplayName,
        policyHolderAvatarUrl: a.insurancePolicyHolderAvatarUrl,
        annualPremium: a.insuranceAnnualPremium,
        sumInsured: a.insuranceSumInsured,
        startsAt: a.insuranceStartsAt,
        expiryDate: a.insuranceExpiryDate,
        termYears: a.insuranceTermYears,
        payCycle: a.insurancePayCycle,
        reminderDaysBefore: a.insuranceReminderDaysBefore ?? 30,
        notes: a.notes,
      }
      return base
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
    }
  })

  return <AssetsListClient items={items} />
}
