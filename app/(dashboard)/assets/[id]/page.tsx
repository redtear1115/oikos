import { notFound, redirect } from 'next/navigation'
import { getTranslations } from '@/lib/i18n/t'
import { getCurrentUser } from '@/lib/supabase/server'
import { getAssetById, getAssetSummary, listAssetsForGroup, listTransactionsPagedForAsset } from '@/lib/db/queries/asset'
import type { AssetWithCar } from '@/lib/db/queries/asset'
import { resolveViewerEpochContext } from '@/lib/db/queries/epoch'
import { canAccessGuardian } from '@/lib/guardian'
import { listFuelLogsWithPrev, fuelStatsForAsset } from '@/lib/db/queries/fuelLog'
import { computeAvgEcon } from '@/lib/fuelEcon'
import { AssetDetailClient } from './_components/AssetDetailClient'
import { ChildDetailClient } from './_components/ChildDetailClient'
import { PetDetailClient } from './_components/PetDetailClient'
import { PlantDetailClient } from './_components/PlantDetailClient'
import { InsuranceDetailClientLegacy } from './_components/InsuranceDetailClientLegacy'
import { InsuranceGatedClient } from './_components/InsuranceGatedClient'
import { SavingsView } from './_components/insurance/SavingsView'
import { getFramingGroup } from '@/lib/insurance'
import { deriveInsuranceBadge, deriveCarInsuranceBadge, insuranceSubtitle } from '@/lib/insuranceBadge'
import type { SiblingChip } from './_components/AibutsuHeader'
import type { SwitcherGroup } from './_components/AssetSwitcher'
import { getInsurancePaymentTotal, getInsuranceReturnTotal, getInsuranceReturnTotalsByCategory, listInsurancePaymentsPaged, listInsuranceReturnsPaged } from '@/lib/db/queries/insurance'
import { listRulesForAsset } from '@/lib/db/queries/recurringIncome'
import { SAVINGS_RETURN_CATEGORIES } from '@/lib/incomeCategories'
import { HouseDetailClient } from './_components/HouseDetailClient'
import { TemplateAssetDetailClient } from './_components/TemplateAssetDetailClient'
import { getChildDetails, getPetDetails, getPlantDetails, getInsuranceDetails, getHouseDetails, getLinkedInsurancesForVehicle } from '@/lib/db/queries/aibutsu'
import type { AssetTemplateKey } from '@/lib/assetTemplates'
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
    originalCurrency: r.originalCurrency ?? null,
    originalAmount: r.originalAmount ?? null,
    rateSnapshot: r.rateSnapshot ?? null,
    tripId: r.tripId ?? null,
  }))
}

/** Build the sibling pill rail chips for aibutsu detail pages (non-insurance assets). */
function buildSiblings(
  allAssetsData: AssetWithCar[],
  currentId: string,
  today: Date,
): SiblingChip[] {
  const allInsurances = allAssetsData.filter(a => a.type === 'insurance')
  const todayMonth = today.getMonth() + 1
  const todayDay = today.getDate()
  return allAssetsData
    .filter(a => a.type !== 'insurance' && a.id !== currentId)
    .map(a => {
      let badge: SiblingChip['badge'] = null
      if (a.type === 'car') {
        badge = deriveCarInsuranceBadge(a.id, allInsurances, today)
      } else if (a.type === 'child' && a.childBirthday) {
        // childBirthday is a date string 'YYYY-MM-DD'
        const [, mm, dd] = a.childBirthday.split('-').map(Number)
        if (mm === todayMonth && dd === todayDay) {
          badge = { tone: 'accent', label: '🎂' }
        }
      }
      const displayName = a.type === 'child' ? (a.childNickname ?? a.name) : a.name
      return { id: a.id, type: a.type as SiblingChip['type'], name: displayName, badge }
    })
}

/** Build SwitcherGroup[] for the insurance dropdown switcher. */
function buildInsuranceGroups(
  allAssetsData: AssetWithCar[],
  today: Date,
  labels: { shortTermProtection: string; longTermProtection: string; savings: string },
): SwitcherGroup[] {
  const allIns = allAssetsData.filter(a => a.type === 'insurance')
  const toItem = (ins: AssetWithCar) => ({
    id: ins.id,
    type: ins.type,
    name: ins.name,
    subtitle: insuranceSubtitle(ins, getFramingGroup(ins.insuranceType), today),
    badge: deriveInsuranceBadge(ins, today),
  })
  return [
    {
      label: labels.shortTermProtection,
      items: allIns
        .filter(i => getFramingGroup(i.insuranceType) === 'protection' && (i.insuranceTermYears ?? 0) <= 1)
        .map(toItem),
    },
    {
      label: labels.longTermProtection,
      items: allIns
        .filter(i => getFramingGroup(i.insuranceType) === 'protection' && (i.insuranceTermYears ?? 0) > 1)
        .map(toItem),
    },
    {
      label: labels.savings,
      items: allIns
        .filter(i => getFramingGroup(i.insuranceType) === 'savings')
        .map(toItem),
    },
  ].filter(g => g.items.length > 0)
}

export default async function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const context = await resolveViewerEpochContext(user.id)
  if (!context) redirect('/onboarding')
  const { group, window: epochWindow } = context

  const asset = await getAssetById(id, group.id)
  if (!asset || asset.deletedAt) notFound()

  // #221/#227 — Guardian beta gate. Insurance asset detail pages live behind
  // the Guardian module; when beta is off, direct URL access (bookmark /
  // shared link / back button) renders an in-place GatedView pointing at the
  // Settings toggle, rather than redirecting silently or 404-ing. Data is
  // preserved on the DB side and reappears when beta is re-enabled.
  if (asset.type === 'insurance' && !canAccessGuardian(group)) {
    return <InsuranceGatedClient />
  }

  const allAssetsData = await listAssetsForGroup(group.id)
  const today = new Date()
  const t = await getTranslations()

  // #222 — Template-based asset path. Routed first so it shadows the legacy
  // type-based branches below (a template-based asset has type='item' anyway,
  // but checking templateKey directly is clearer and survives a future
  // type-enum cleanup).
  if (asset.templateKey != null) {
    const [summary, txnRows] = await Promise.all([
      getAssetSummary(asset.id, group.id, epochWindow),
      listTransactionsPagedForAsset(asset.id, group.id, null, PAGE_SIZE, epochWindow),
    ])
    const initialTxns = serializeTxns(txnRows)
    const templateKey = asset.templateKey as AssetTemplateKey
    const templateFields = (asset.templateFields ?? {}) as Record<string, string | number | null>
    const assetSheetInitial: AssetSheetInitial = {
      id: asset.id,
      type: 'item',
      name: asset.name,
      notes: asset.notes,
      templateKey,
      templateFields,
    }
    return (
      <TemplateAssetDetailClient
        assetId={asset.id}
        name={asset.name}
        notes={asset.notes ?? null}
        templateKey={templateKey}
        templateFields={templateFields}
        summary={summary}
        assetSheetInitial={assetSheetInitial}
        initialTxns={initialTxns}
        pageSize={PAGE_SIZE}
        siblings={buildSiblings(allAssetsData, asset.id, today)}
      />
    )
  }

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
      // #826 — has-value bool only; the encrypted full name itself never
      // reaches the client. Reveal goes through revealChildName.
      childHasFullName: Boolean(asset.nameEncrypted),
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
        siblings={buildSiblings(allAssetsData, asset.id, today)}
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
        siblings={buildSiblings(allAssetsData, asset.id, today)}
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
        siblings={buildSiblings(allAssetsData, asset.id, today)}
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
        siblings={buildSiblings(allAssetsData, asset.id, today)}
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
      insInsuredChildId: insuranceDetailsData?.insuredChildId ?? null,
      insInsuredUserId: insuranceDetailsData?.insuredUserId ?? null,
      insPolicyHolderUserId: insuranceDetailsData?.policyHolderUserId ?? null,
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
      insAccountValue: insuranceDetailsData?.accountValue ?? null,
    }
    const framingGroup = getFramingGroup(insuranceDetailsData?.kind)

    if (framingGroup === 'savings' && insuranceDetailsData) {
      const [premiumStats, returnStats, returnByCat, premiumRows, returnRows, recurringRules] = await Promise.all([
        getInsurancePaymentTotal(asset.id, group.id, epochWindow),
        getInsuranceReturnTotal(asset.id, group.id, SAVINGS_RETURN_CATEGORIES, epochWindow),
        getInsuranceReturnTotalsByCategory(asset.id, group.id, SAVINGS_RETURN_CATEGORIES, epochWindow),
        listInsurancePaymentsPaged(asset.id, group.id, null, PAGE_SIZE, epochWindow),
        listInsuranceReturnsPaged(asset.id, group.id, SAVINGS_RETURN_CATEGORIES, null, PAGE_SIZE, epochWindow),
        listRulesForAsset(group.id, asset.id),
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
        kind: 'transaction' as const,
        assetId: r.assetId ?? null,
        fuelLogId: r.fuelLogId ?? null,
        notes: r.notes,
        status: r.status ?? 'settled',
        originalCurrency: r.originalCurrency ?? null,
        originalAmount: r.originalAmount ?? null,
        rateSnapshot: r.rateSnapshot ?? null,
        tripId: r.tripId ?? null,
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
          linkedVehicle={linkedVehicle}
          recurringRules={recurringRules}
          allInsuranceGroups={buildInsuranceGroups(allAssetsData, today, t.assetListItem.insuranceGroups)}
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
        allInsuranceGroups={buildInsuranceGroups(allAssetsData, today, t.assetListItem.insuranceGroups)}
      />
    )
  }

  const [summary, txnRows, fuelLogs, fuelStats, linkedInsurances] = await Promise.all([
    getAssetSummary(id, group.id, epochWindow),
    listTransactionsPagedForAsset(id, group.id, null, PAGE_SIZE, epochWindow),
    listFuelLogsWithPrev(id, epochWindow),
    fuelStatsForAsset(id, epochWindow),
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

  const carGroups: SwitcherGroup[] = [
    {
      label: '車輛',
      items: allAssetsData
        .filter(a => a.type === 'car')
        .map(a => ({
          id: a.id,
          type: a.type,
          name: a.name,
          badge: deriveCarInsuranceBadge(a.id, allAssetsData.filter(x => x.type === 'insurance'), today),
        })),
    },
  ]

  return (
    <AssetDetailClient
      assetId={asset.id}
      notes={asset.notes ?? null}
      linkedInsurances={linkedInsurances}
      siblings={buildSiblings(allAssetsData, asset.id, today)}
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
      groups={carGroups}
      hasPlate={Boolean(asset.plateEncrypted)}
    />
  )
}
