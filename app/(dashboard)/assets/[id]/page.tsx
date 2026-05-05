import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { oikosGroups } from '@/lib/db/schema'
import { eq, or } from 'drizzle-orm'
import { getAssetById, getAssetSummary, listTransactionsPagedForAsset } from '@/lib/db/queries/asset'
import { listFuelLogsWithPrev, fuelStatsForAsset } from '@/lib/db/queries/fuelLog'
import { computeAvgEcon } from '@/lib/fuelEcon'
import { AssetDetailClient } from './_components/AssetDetailClient'
import { ChildDetailClient } from './_components/ChildDetailClient'
import { PetDetailClient } from './_components/PetDetailClient'
import { InsuranceDetailClient } from './_components/InsuranceDetailClient'
import { getChildDetails, getPetDetails, getInsuranceDetails } from '@/lib/db/queries/aibutsu'

const PAGE_SIZE = 20

export default async function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const [group] = await db
    .select()
    .from(oikosGroups)
    .where(or(eq(oikosGroups.memberA, user.id), eq(oikosGroups.memberB, user.id)))
    .limit(1)
  if (!group) throw new Error('No group')

  const asset = await getAssetById(id, group.id)
  if (!asset || asset.deletedAt) notFound()

  if (asset.type === 'child') {
    const [childDetailsData, summary] = await Promise.all([
      getChildDetails(asset.id),
      getAssetSummary(asset.id, group.id),
    ])
    return (
      <ChildDetailClient
        assetId={asset.id}
        name={asset.name}
        details={childDetailsData}
        summary={summary}
      />
    )
  }

  if (asset.type === 'pet') {
    const [petDetailsData, summary] = await Promise.all([
      getPetDetails(asset.id),
      getAssetSummary(asset.id, group.id),
    ])
    return (
      <PetDetailClient
        assetId={asset.id}
        name={asset.name}
        details={petDetailsData}
        summary={summary}
      />
    )
  }

  if (asset.type === 'insurance') {
    const insuranceDetailsData = await getInsuranceDetails(asset.id)
    return (
      <InsuranceDetailClient
        assetId={asset.id}
        name={asset.name}
        details={insuranceDetailsData}
      />
    )
  }

  const [summary, txnRows, fuelLogs, fuelStats] = await Promise.all([
    getAssetSummary(id, group.id),
    listTransactionsPagedForAsset(id, group.id, null, PAGE_SIZE),
    listFuelLogsWithPrev(id),
    fuelStatsForAsset(id),
  ])

  const initialTxns = txnRows.map((r) => ({
    id: r.id,
    amount: r.amount,
    splitType: r.splitType,
    description: r.description,
    category: r.category,
    paidBy: r.paidBy,
    transactedAt: r.transactedAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    kind: r.kind,
    assetId: r.assetId ?? null,
    fuelLogId: r.fuelLogId ?? null,
  }))

  const avgEcon = computeAvgEcon(
    fuelLogs.map(f => ({ liters: f.liters, odometer: f.odometer, loggedAt: f.loggedAt })),
  )

  // Serialize fuelLogs for client (Date → ISO string)
  const initialFuelLogs = fuelLogs.map(f => ({
    id: f.id,
    liters: f.liters,
    odometer: f.odometer,
    station: f.station,
    loggedAt: f.loggedAt.toISOString(),
    prevOdometer: f.prevOdometer,
    fuelType: f.fuelType,
  }))

  return (
    <AssetDetailClient
      assetId={asset.id}
      assetSheetInitial={{
        id: asset.id,
        type: asset.type,
        name: asset.name,
        plate: asset.plate ?? undefined,
        purchasedAt: asset.purchasedAt,
        purchasePrice: asset.purchasePrice,
        // '92' and 'electric' are legacy enum values; coerce to '95' for UI
        fuelType: (asset.fuelType === '92' || asset.fuelType === 'electric' ? '95' : asset.fuelType) ?? '95',
        primaryUserId: asset.primaryUserId,
        color: asset.color,
        year: asset.year,
        brand: asset.brand,
        model: asset.model,
        initialOdometer: asset.initialOdometer,
      }}
      fuelType={asset.fuelType ?? '95'}
      primaryUserId={asset.primaryUserId}
      brand={asset.brand ?? null}
      model={asset.model ?? null}
      year={asset.year ?? null}
      initialOdometer={asset.initialOdometer ?? null}
      monthAmount={summary.monthAmount}
      totalAmount={summary.totalAmount}
      monthFuel={fuelStats.monthFuel}
      totalFuel={fuelStats.totalFuel}
      avgEcon={avgEcon}
      initialTxns={initialTxns}
      initialFuelLogs={initialFuelLogs}
      pageSize={PAGE_SIZE}
    />
  )
}
