import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { oikosGroups } from '@/lib/db/schema'
import { eq, or } from 'drizzle-orm'
import { getAssetById, getAssetSummary, listTransactionsPagedForAsset } from '@/lib/db/queries/asset'
import { listFuelLogsWithPrev, fuelStatsForAsset } from '@/lib/db/queries/fuelLog'
import { computeAvgEcon } from '@/lib/fuelEcon'
import { AssetDetailClient } from './_components/AssetDetailClient'

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
        name: asset.name,
        plate: asset.plate ?? '',
        purchasedAt: asset.purchasedAt,
        purchasePrice: asset.purchasePrice,
        // '92' is a legacy enum value that can't be dropped from Postgres; coerce to '95' for UI
        fuelType: (asset.fuelType === '92' ? '95' : asset.fuelType) ?? '95',
        primaryUserId: asset.primaryUserId,
      }}
      fuelType={asset.fuelType ?? '95'}
      primaryUserId={asset.primaryUserId}
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
