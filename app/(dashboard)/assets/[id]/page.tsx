import { notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { oikosGroups } from '@/lib/db/schema'
import { eq, or } from 'drizzle-orm'
import { getAssetById, getAssetSummary, listAssetsForGroup, listTransactionsPagedForAsset } from '@/lib/db/queries/asset'
import { resolveViewerEpochWindow } from '@/lib/db/queries/epoch'
import { getActiveGroupForUser } from '@/lib/db/queries/group'
import { listFuelLogsWithPrev, fuelStatsForAsset } from '@/lib/db/queries/fuelLog'
import { computeAvgEcon } from '@/lib/fuelEcon'
import { AssetDetailClient } from './_components/AssetDetailClient'
import { ChildDetailClient } from './_components/ChildDetailClient'
import { PetDetailClient } from './_components/PetDetailClient'
import { PlantDetailClient } from './_components/PlantDetailClient'
import { InsuranceDetailClientLegacy } from './_components/InsuranceDetailClientLegacy'
import { SavingsView } from './_components/insurance/SavingsView'
import { getFramingGroup } from '@/lib/insurance'
import { getInsurancePaymentTotal, getInsuranceReturnTotal, getInsuranceReturnTotalsByCategory, listInsurancePaymentsPaged, listInsuranceReturnsPaged } from '@/lib/db/queries/insurance'
import { SAVINGS_RETURN_CATEGORIES } from '@/lib/incomeCategories'
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
    splitRatioA: r.splitRatioA ?? null,
    description: r.description,
    category: r.category,
    paidBy: r.paidBy,
    transactedAt: r.transactedAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    kind: r.kind,
    assetId: r.assetId ?? null,
    fuelLogId: r.fuelLogId ?? null,
    notes: r.notes,
    status: r.status ?? 'settled',
  }))
}

export default async function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const group = await getActiveGroupForUser(user.id)
  if (!group) throw new Error('No group')

  const asset = await getAssetById(id, group.id)
  if (!asset || asset.deletedAt) notFound()

  // Past-times view: every per-asset query below scopes by this window so the
  // detail page's txn list, summary card, and insurance/SavingsView totals all
  // tell the same story for the chosen epoch.
  const epochWindow = await resolveViewerEpochWindow(group.id)

  const allAssetsData = await listAssetsForGroup(group.id)
  const allAssets = allAssetsData.map(a => ({ id: a.id, name: a.name, type: a.type }))

  if (asset.type === 'child') {
    const [childDetailsData, summary, txnRows] = await Promise.all([
      getChildDetails(asset.id),
      getAssetSummary(asset.id, group.id, epochWindow),
      listTransactionsPagedForAsset(asset.id, group.id, null, PAGE_SIZE, epochWindow),
    ])
    const initialTxns = serializeTxns(txnRows)
    const assetSheetInitial: AssetSheetInitial = {
      id: asset.id,
      type: 'child',
      name: asset.name,
      notes: asset.notes,
      childNickname: childDetailsData?.nickname ?? null,
      childGender: childDetailsData?.gender ?? null,
      childBirthday: childDetailsData?.birthday ?? null,
      // Encrypted PII never reaches the client. The form starts empty —
      // hasX flags drive 「清除」 affordance + 留空=不變更 placeholder.
      childHasNationalId: childDetailsData?.hasNationalId ?? false,
      childHasNhiNo: childDetailsData?.hasNhiNo ?? false,
      childBloodType: childDetailsData?.bloodType ?? null,
      childHospital: childDetailsData?.hospital ?? null,
      childHeightCm: childDetailsData?.heightCm ?? null,
      childWeightG: childDetailsData?.weightG ?? null,
    }
    return (
      <ChildDetailClient
        assetId={asset.id}
        name={asset.name}
        nickname={childDetailsData?.nickname ?? null}
        notes={asset.notes ?? null}
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
      getAssetSummary(asset.id, group.id, epochWindow),
      listTransactionsPagedForAsset(asset.id, group.id, null, PAGE_SIZE, epochWindow),
    ])
    const initialTxns = serializeTxns(txnRows)
    const assetSheetInitial: AssetSheetInitial = {
      id: asset.id,
      type: 'pet',
      name: asset.name,
      notes: asset.notes,
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
        notes={asset.notes ?? null}
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
      getAssetSummary(asset.id, group.id, epochWindow),
      listTransactionsPagedForAsset(asset.id, group.id, null, PAGE_SIZE, epochWindow),
    ])
    const initialTxns = serializeTxns(txnRows)
    const assetSheetInitial: AssetSheetInitial = {
      id: asset.id,
      type: 'plant',
      name: asset.name,
      notes: asset.notes,
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
        notes={asset.notes ?? null}
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
      getAssetSummary(asset.id, group.id, epochWindow),
      listTransactionsPagedForAsset(asset.id, group.id, null, PAGE_SIZE, epochWindow),
    ])
    const initialTxns = serializeTxns(txnRows)
    const assetSheetInitial: AssetSheetInitial = {
      id: asset.id,
      type: 'house',
      name: asset.name,
      notes: asset.notes,
      houseAddress: houseDetailsData?.address ?? null,
      housePurchasedAt: houseDetailsData?.purchasedAt ?? null,
      housePurchasePrice: houseDetailsData?.purchasePrice ?? null,
    }
    return (
      <HouseDetailClient
        assetId={asset.id}
        name={asset.name}
        notes={asset.notes ?? null}
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
      notes: asset.notes,
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
      insExpectedMaturityAmount: insuranceDetailsData?.expectedMaturityAmount ?? null,
    }
    const framingGroup = getFramingGroup(insuranceDetailsData?.kind)

    if (framingGroup === 'savings' && insuranceDetailsData) {
      const [premiumStats, returnStats, returnByCat, premiumRows, returnRows] = await Promise.all([
        getInsurancePaymentTotal(asset.id, group.id, epochWindow),
        getInsuranceReturnTotal(asset.id, group.id, SAVINGS_RETURN_CATEGORIES, epochWindow),
        getInsuranceReturnTotalsByCategory(asset.id, group.id, SAVINGS_RETURN_CATEGORIES, epochWindow),
        listInsurancePaymentsPaged(asset.id, group.id, null, PAGE_SIZE, epochWindow),
        listInsuranceReturnsPaged(asset.id, group.id, SAVINGS_RETURN_CATEGORIES, null, PAGE_SIZE, epochWindow),
      ])

      // Plain-object shape for the client component (Map isn't serialisable
      // through the Server → Client boundary).
      const returnBreakdown: Record<string, number> = {}
      for (const cat of SAVINGS_RETURN_CATEGORIES) {
        returnBreakdown[cat] = returnByCat.get(cat)?.total ?? 0
      }

      const initialPremiumTxns: PagedTxnRow[] = premiumRows.map((r) => ({
        id: r.id,
        amount: r.amount,
        splitType: r.splitType,
        splitRatioA: r.splitRatioA ?? null,
        description: r.description,
        category: r.category,
        paidBy: r.paidBy,
        transactedAt: r.transactedAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
        kind: 'transaction',
        assetId: r.assetId ?? null,
        fuelLogId: r.fuelLogId ?? null,
        notes: r.notes,
        status: r.status ?? 'settled',
      }))

      const initialReturns = returnRows.map((r) => ({
        id: r.id,
        amount: r.amount,
        category: r.category,
        source: r.source,
        recipientId: r.recipientId,
        assetId: r.assetId,
        occurredAt: r.occurredAt,
        createdAt: r.createdAt.toISOString(),
        kind: 'income' as const,
      }))

      return (
        <SavingsView
          assetId={asset.id}
          name={asset.name}
          notes={asset.notes ?? null}
          details={insuranceDetailsData}
          premiumStats={premiumStats}
          returnStats={returnStats}
          returnBreakdown={returnBreakdown}
          initialPremiumTxns={initialPremiumTxns}
          initialReturns={initialReturns}
          pageSize={PAGE_SIZE}
          assetSheetInitial={assetSheetInitial}
          allAssets={allAssets}
          linkedVehicle={linkedVehicle}
        />
      )
    }

    return (
      <InsuranceDetailClientLegacy
        assetId={asset.id}
        name={asset.name}
        notes={asset.notes ?? null}
        details={insuranceDetailsData}
        linkedVehicle={linkedVehicle}
        assetSheetInitial={assetSheetInitial}
        allAssets={allAssets}
      />
    )
  }

  const [summary, txnRows, fuelLogs, fuelStats, linkedInsurances] = await Promise.all([
    getAssetSummary(id, group.id, epochWindow),
    listTransactionsPagedForAsset(id, group.id, null, PAGE_SIZE, epochWindow),
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
      notes={asset.notes ?? null}
      linkedInsurances={linkedInsurances}
      assetSheetInitial={{
        id: asset.id,
        type: asset.type,
        name: asset.name,
        notes: asset.notes,
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
