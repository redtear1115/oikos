import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { listAssetsForGroup, getAssetSummariesBatch } from '@/lib/db/queries/asset'
import { resolveViewerEpochContext } from '@/lib/db/queries/epoch'
import { getCarHeroStats } from '@/lib/db/queries/fuelLog'
import { getChildNicknames, getPetListDetailsBatch, getPlantListDetailsBatch } from '@/lib/db/queries/aibutsu'
import { AssetsListClient, type AssetsListItem } from './_components/AssetsListClient'

export default async function AssetsPage() {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const context = await resolveViewerEpochContext(user.id)
  if (!context) redirect('/onboarding')
  const { group, window: epochWindow } = context

  const assetRows = await listAssetsForGroup(group.id)

  const childIds = assetRows.filter((a) => a.type === 'child').map((a) => a.id)
  const petIds = assetRows.filter((a) => a.type === 'pet').map((a) => a.id)
  const plantIds = assetRows.filter((a) => a.type === 'plant').map((a) => a.id)
  const allIds = assetRows.map((a) => a.id)
  const carRows = assetRows.filter((a) => a.type === 'car')

  // Batch all fetches in parallel — no shared dependencies.
  const [childNicknames, summaries, carStatsList, petListDetails, plantListDetails] = await Promise.all([
    getChildNicknames(childIds),
    getAssetSummariesBatch(allIds, group.id, epochWindow),
    Promise.all(
      carRows.map(async (a) => [a.id, await getCarHeroStats(a.id, a.initialOdometer, epochWindow)] as const),
    ),
    getPetListDetailsBatch(petIds),
    getPlantListDetailsBatch(plantIds),
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
        insuredChildId: a.insuranceInsuredChildId,
        insuredChildName: a.insuranceInsuredChildName,
        insuredUserId: a.insuranceInsuredUserId,
        insuredUserDisplayName: a.insuranceInsuredUserDisplayName,
        policyHolderUserId: a.insurancePolicyHolderUserId,
        policyHolderDisplayName: a.insurancePolicyHolderDisplayName,
        policyHolderAvatarUrl: a.insurancePolicyHolderAvatarUrl,
        insurer: a.insuranceInsurer,
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
    if (a.type === 'child') {
      return {
        ...base,
        childBirthday: a.childBirthday,
        childHeightCm: a.childHeightCm,
        childWeightG: a.childWeightG,
      }
    }
    if (a.type === 'pet') {
      const petDetail = petListDetails.get(a.id)
      return {
        ...base,
        petSpecies: petDetail?.species ?? null,
        petBreed: petDetail?.breed ?? null,
        petBirthDate: petDetail?.birthDate ?? null,
        petWeightG: petDetail?.weightG ?? null,
      }
    }
    if (a.type === 'plant') {
      const plantDetail = plantListDetails.get(a.id)
      return {
        ...base,
        plantLocation: plantDetail?.location ?? null,
        plantSproutedAt: plantDetail?.sproutedAt ?? null,
        plantWaterEvery: plantDetail?.waterEvery ?? null,
      }
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
      avgFuelEcon: heroStats.avgFuelEcon,
    }
  })

  return <AssetsListClient items={items} />
}
