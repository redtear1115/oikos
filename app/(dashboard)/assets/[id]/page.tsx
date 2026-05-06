import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { oikosGroups } from '@/lib/db/schema'
import { eq, or } from 'drizzle-orm'
import { getAssetById, getAssetSummary, listAssetsForGroup, listTransactionsPagedForAsset } from '@/lib/db/queries/asset'
import { listFuelLogsWithPrev, fuelStatsForAsset } from '@/lib/db/queries/fuelLog'
import { computeAvgEcon } from '@/lib/fuelEcon'
import { AssetDetailClient } from './_components/AssetDetailClient'
import { ChildDetailClient } from './_components/ChildDetailClient'
import { PetDetailClient } from './_components/PetDetailClient'
import { PlantDetailClient } from './_components/PlantDetailClient'
import { InsuranceDetailClient } from './_components/InsuranceDetailClient'
import { HouseDetailClient } from './_components/HouseDetailClient'
import { getChildDetails, getPetDetails, getPlantDetails, getInsuranceDetails, getHouseDetails, getLinkedInsurancesForVehicle } from '@/lib/db/queries/aibutsu'
import type { AssetSheetInitial } from '@/app/(dashboard)/assets/_components/AssetSheet'
import type { PagedTxnRow } from '@/actions/transaction'

const PAGE_SIZE = 20

function serializeTxns(rows: Awaited<ReturnType<typeof listTransactionsPagedForAsset>>): PagedTxnRow[] {
  return rows.map((r) => ({
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
}

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

  const allAssetsData = await listAssetsForGroup(group.id)
  const allAssets = allAssetsData.map(a => ({ id: a.id, name: a.name, type: a.type }))

  if (asset.type === 'child') {
    const [childDetailsData, summary, txnRows] = await Promise.all([
      getChildDetails(asset.id),
      getAssetSummary(asset.id, group.id),
      listTransactionsPagedForAsset(asset.id, group.id, null, PAGE_SIZE),
    ])
    const initialTxns = serializeTxns(txnRows)
    const assetSheetInitial: AssetSheetInitial = {
      id: asset.id,
      type: 'child',
      name: asset.name,
      childNickname: childDetailsData?.nickname ?? null,
      childGender: childDetailsData?.gender ?? null,
      childBirthday: childDetailsData?.birthday ?? null,
      childNationalId: childDetailsData?.nationalId ?? null,
      childNhiNo: childDetailsData?.nhiNo ?? null,
      childBloodType: childDetailsData?.bloodType ?? null,
      childHospital: childDetailsData?.hospital ?? null,
      childHeightCm: childDetailsData?.heightCm ?? null,
      childWeightG: childDetailsData?.weightG ?? null,
    }
    return (
      <ChildDetailClient
        assetId={asset.id}
        name={asset.name}
        details={childDetailsData}
        summary={summary}
        assetSheetInitial={assetSheetInitial}
        initialTxns={initialTxns}
        pageSize={PAGE_SIZE}
        allAssets={allAssets}
      />
    )
  }

  if (asset.type === 'pet') {
    const [petDetailsData, summary, txnRows] = await Promise.all([
      getPetDetails(asset.id),
      getAssetSummary(asset.id, group.id),
      listTransactionsPagedForAsset(asset.id, group.id, null, PAGE_SIZE),
    ])
    const initialTxns = serializeTxns(txnRows)
    const assetSheetInitial: AssetSheetInitial = {
      id: asset.id,
      type: 'pet',
      name: asset.name,
      petSpecies: petDetailsData?.species ?? null,
      petBreed: petDetailsData?.breed ?? null,
      petSex: petDetailsData?.sex ?? null,
      petBirthDate: petDetailsData?.birthDate ?? null,
      petAdoptedDate: petDetailsData?.adoptedDate ?? null,
      petPurchaseCost: petDetailsData?.purchaseCost ?? null,
      petWeightG: petDetailsData?.weightG ?? null,
      petChipNo: petDetailsData?.chipNo ?? null,
      petVet: petDetailsData?.vet ?? null,
    }
    return (
      <PetDetailClient
        assetId={asset.id}
        name={asset.name}
        details={petDetailsData}
        summary={summary}
        assetSheetInitial={assetSheetInitial}
        initialTxns={initialTxns}
        pageSize={PAGE_SIZE}
        allAssets={allAssets}
      />
    )
  }

  if (asset.type === 'plant') {
    const [plantDetailsData, summary, txnRows] = await Promise.all([
      getPlantDetails(asset.id),
      getAssetSummary(asset.id, group.id),
      listTransactionsPagedForAsset(asset.id, group.id, null, PAGE_SIZE),
    ])
    const initialTxns = serializeTxns(txnRows)
    const assetSheetInitial: AssetSheetInitial = {
      id: asset.id,
      type: 'plant',
      name: asset.name,
      plantSpecies: plantDetailsData?.species ?? null,
      plantLocation: plantDetailsData?.location ?? null,
      plantSproutedAt: plantDetailsData?.sproutedAt ?? null,
      plantCost: plantDetailsData?.cost ?? null,
      plantWaterEvery: plantDetailsData?.waterEvery ?? null,
    }
    return (
      <PlantDetailClient
        assetId={asset.id}
        name={asset.name}
        details={plantDetailsData}
        summary={summary}
        assetSheetInitial={assetSheetInitial}
        initialTxns={initialTxns}
        pageSize={PAGE_SIZE}
        allAssets={allAssets}
      />
    )
  }

  if (asset.type === 'house') {
    const [houseDetailsData, summary, txnRows] = await Promise.all([
      getHouseDetails(asset.id),
      getAssetSummary(asset.id, group.id),
      listTransactionsPagedForAsset(asset.id, group.id, null, PAGE_SIZE),
    ])
    const initialTxns = serializeTxns(txnRows)
    const assetSheetInitial: AssetSheetInitial = {
      id: asset.id,
      type: 'house',
      name: asset.name,
      houseAddress: houseDetailsData?.address ?? null,
      housePurchasedAt: houseDetailsData?.purchasedAt ?? null,
      housePurchasePrice: houseDetailsData?.purchasePrice ?? null,
    }
    return (
      <HouseDetailClient
        assetId={asset.id}
        name={asset.name}
        details={houseDetailsData}
        summary={summary}
        assetSheetInitial={assetSheetInitial}
        initialTxns={initialTxns}
        pageSize={PAGE_SIZE}
        allAssets={allAssets}
      />
    )
  }

  if (asset.type === 'insurance') {
    const insuranceDetailsData = await getInsuranceDetails(asset.id)

    // Resolve linked vehicle name if vehicleId is set (allAssetsData already excludes deleted)
    let linkedVehicle: { id: string; name: string } | null = null
    if (insuranceDetailsData?.vehicleId) {
      const vehicleAsset = allAssetsData.find(a => a.id === insuranceDetailsData.vehicleId)
      if (vehicleAsset) {
        linkedVehicle = { id: vehicleAsset.id, name: vehicleAsset.name }
      }
    }

    const assetSheetInitial: AssetSheetInitial = {
      id: asset.id,
      type: 'insurance',
      name: asset.name,
      insKind: insuranceDetailsData?.kind ?? null,
      insInsured: insuranceDetailsData?.insured ?? null,
      insInsurer: insuranceDetailsData?.insurer ?? null,
      insPolicyNo: insuranceDetailsData?.policyNo ?? null,
      insAnnualPremium: insuranceDetailsData?.annualPremium ?? null,
      insSumInsured: insuranceDetailsData?.sumInsured ?? null,
      insPayCycle: insuranceDetailsData?.payCycle ?? null,
      insStartsAt: insuranceDetailsData?.startsAt ?? null,
      insEndsAt: insuranceDetailsData?.endsAt ?? null,
      insTermYears: insuranceDetailsData?.termYears ?? null,
      insVehicleId: insuranceDetailsData?.vehicleId ?? null,
    }
    return (
      <InsuranceDetailClient
        assetId={asset.id}
        name={asset.name}
        details={insuranceDetailsData}
        linkedVehicle={linkedVehicle}
        assetSheetInitial={assetSheetInitial}
        allAssets={allAssets}
      />
    )
  }

  const [summary, txnRows, fuelLogs, fuelStats, linkedInsurances] = await Promise.all([
    getAssetSummary(id, group.id),
    listTransactionsPagedForAsset(id, group.id, null, PAGE_SIZE),
    listFuelLogsWithPrev(id),
    fuelStatsForAsset(id),
    getLinkedInsurancesForVehicle(id),
  ])

  const initialTxns = serializeTxns(txnRows)

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
      linkedInsurances={linkedInsurances}
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
      allAssets={allAssets}
    />
  )
}
