'use client'

import { useCallback, useRef, useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import { useRealtimeEvents } from '@/app/(dashboard)/_components/RealtimeProvider'
import { PlusIcon } from '@/app/(dashboard)/_components/PlusIcon'
import { AssetSheet } from './AssetSheet'
import { InsuranceListItem } from './InsuranceListItem'
import { AssetEmptyState } from './AssetEmptyState'
import { CarHeroCard } from './CarHeroCard'
import { ChildCard, PetCard, PlantCard, ItemCard, HouseCard } from './AibutsuCard'
import { GatedView } from '@/app/(dashboard)/_components/GatedView'
import { useTranslations } from '@/lib/i18n/client'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { getFramingGroup } from '@/lib/insurance'
import { parseLocalDate, todayLocalDate, daysBetween } from '@/lib/local-date'
import type { AssetType } from '@/lib/assets'

type AssetsTab = 'aibutsu' | 'guardian'

export interface AssetsListItem {
  id: string
  type: AssetType
  name: string
  /** Optional nickname (currently only populated for child assets). When
   *  present, list items render nickname-first with legal name as secondary. */
  nickname?: string | null
  plate: string | null
  monthAmount: number
  /** Insurance-only: true when InsuranceDetails.insurance_type === 'savings'.
   *  Drives the 「儲蓄」badge in AssetListItem. */
  isSavings?: boolean
  /** Insurance-only: full payload powering the type-specific InsuranceListItem.
   *  Present when type === 'insurance'. */
  insurance?: {
    insuranceType: string | null
    insured: string | null
    insuredChildId: string | null
    insuredChildName: string | null
    insuredUserId: string | null
    insuredUserDisplayName: string | null
    policyHolderUserId: string | null
    policyHolderDisplayName: string | null
    policyHolderAvatarUrl: string | null
    insurer: string | null
    annualPremium: number | null
    sumInsured: number | null
    startsAt: string | null
    expiryDate: string | null
    termYears: number | null
    payCycle: string | null
    reminderDaysBefore: number
    notes: string | null
  }
  // Car-only extras (optional; ignored for non-car types)
  color?: string | null
  year?: number | null
  brand?: string | null
  model?: string | null
  latestOdometer?: number | null
  avgFuelEcon?: number | null
  lastFuelDate?: string | null
  // House extras
  houseAddress?: string | null
  // Child extras
  childBirthday?: string | null
  childHeightCm?: number | null
  childWeightG?: number | null
  // Pet extras
  petSpecies?: string | null
  petBreed?: string | null
  petBirthDate?: string | null
  petWeightG?: number | null
  // Plant extras
  plantLocation?: string | null
  plantSproutedAt?: string | null
  plantWaterEvery?: number | null
}

interface Props {
  items: AssetsListItem[]
}

// #160 — section headers were too quiet to anchor the eye. Stronger weight,
// serif type, and a colored dot in the section's representative tint give
// each group a clear identity without adding chrome.
function SectionLabel({ label, dotColor }: { label: string; dotColor: string }) {
  return (
    <div className="flex items-center gap-2 px-1 pb-1">
      <span
        aria-hidden="true"
        className="inline-block rounded-full shrink-0"
        style={{ width: 8, height: 8, background: dotColor }}
      />
      <div
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 'var(--fs-button)',
          fontWeight: 500,
          color: 'var(--ink)',
          letterSpacing: '-0.2px',
        }}
      >
        {label}
      </div>
    </div>
  )
}

/** Guardian summary card — totals + next renewal */
function GuardianSummary({ insurances }: { insurances: AssetsListItem[] }) {
  const today = todayLocalDate()
  const totalAnnual = insurances.reduce((sum, a) => sum + (a.insurance?.annualPremium ?? 0), 0)
  const count = insurances.length

  // Next renewal: single-year policies with future expiry, min expiryDate
  const singleYears = insurances.filter((a) => {
    const framing = getFramingGroup(a.insurance?.insuranceType)
    const termYears = a.insurance?.termYears ?? 0
    return framing === 'protection' && termYears <= 1 && a.insurance?.expiryDate
  })
  const upcoming = singleYears
    .map((a) => {
      const d = parseLocalDate(a.insurance?.expiryDate)
      return d ? { a, d, days: daysBetween(today, d) } : null
    })
    .filter((x): x is { a: AssetsListItem; d: Date; days: number } => x !== null && x.days >= 0)
    .sort((x, y) => x.days - y.days)[0]

  return (
    <div
      style={{
        padding: '16px 18px',
        borderRadius: 16,
        background: 'var(--surface)',
        border: '1px solid var(--hairline)',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}
    >
      <div style={{ flex: 1 }}>
        <div
          className="font-mono"
          style={{ fontSize: 10, letterSpacing: 1.2, color: 'var(--ink-3)' }}
        >
          年繳保費
        </div>
        <div
          className="tnum"
          style={{ marginTop: 4, fontSize: 22, fontWeight: 600, color: 'var(--ink)' }}
        >
          NT$ {totalAnnual.toLocaleString('en-US')}
        </div>
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--ink-3)' }}>
          共{' '}
          <span style={{ color: 'var(--ink-2)', fontWeight: 600 }}>{count}</span>
          {' '}張保單
        </div>
      </div>
      <div
        aria-hidden="true"
        style={{ width: 1, alignSelf: 'stretch', background: 'var(--hairline)' }}
      />
      <div style={{ flex: 1 }}>
        <div
          className="font-mono"
          style={{ fontSize: 10, letterSpacing: 1.2, color: 'var(--ink-3)' }}
        >
          下次續約
        </div>
        {upcoming ? (
          <>
            <div
              className="font-mono tnum"
              style={{ marginTop: 4, fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}
            >
              {upcoming.a.insurance?.expiryDate ?? '—'}
            </div>
            <div style={{ marginTop: 4, fontSize: 11, color: 'var(--ink-3)' }}>
              {upcoming.a.name} · {upcoming.days} 天後
            </div>
          </>
        ) : (
          <div style={{ marginTop: 4, fontSize: 13, color: 'var(--ink-3)' }}>—</div>
        )}
      </div>
    </div>
  )
}

export function AssetsListClient({ items }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const t = useTranslations()
  const { canAccessGuardian: guardianVisible } = useMember()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [typeFilter, setTypeFilter] = useState<AssetType | 'all'>('all')

  // Refresh when partner adds/updates/deletes an asset
  useRealtimeEvents((event) => {
    if (event.kind === 'asset-changed' || event.kind === 'reconnect') {
      router.refresh()
    }
  })

  const tabParam = searchParams.get('tab')
  // #227 — when Guardian beta is OFF but the URL points at the guardian tab
  // (stale bookmark / browser back), show the GatedView in-place instead of
  // silently collapsing to 愛物.
  const guardianGated = !guardianVisible && tabParam === 'guardian'
  const activeTab: AssetsTab = guardianVisible && tabParam === 'guardian' ? 'guardian' : 'aibutsu'

  const setActiveTab = useCallback(
    (next: AssetsTab) => {
      const params = new URLSearchParams(searchParams.toString())
      if (next === 'guardian') params.set('tab', 'guardian')
      else params.delete('tab')
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname, searchParams],
  )

  const touchRef = useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (e: React.TouchEvent) => {
    const t0 = e.touches[0]
    touchRef.current = { x: t0.clientX, y: t0.clientY }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchRef.current
    touchRef.current = null
    if (!start) return
    if (!guardianVisible) return
    const t1 = e.changedTouches[0]
    const dx = t1.clientX - start.x
    const dy = t1.clientY - start.y
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return
    if (dx < 0 && activeTab === 'aibutsu') setActiveTab('guardian')
    else if (dx > 0 && activeTab === 'guardian') setActiveTab('aibutsu')
  }

  const handleClose = () => setSheetOpen(false)
  const handleMutated = () => router.refresh()

  const cars = items.filter((a) => a.type === 'car')
  const houses = items.filter((a) => a.type === 'house')
  const children = items.filter((a) => a.type === 'child')
  const pets = items.filter((a) => a.type === 'pet')
  const plants = items.filter((a) => a.type === 'plant')
  const itemsTemplated = items.filter((a) => a.type === 'item')
  const insurances = items
    .filter((a) => a.type === 'insurance')
    .slice()
    .sort((a, b) => {
      const aExp = a.insurance?.expiryDate ?? null
      const bExp = b.insurance?.expiryDate ?? null
      if (aExp && bExp) return aExp.localeCompare(bExp)
      if (aExp) return -1
      if (bExp) return 1
      return 0
    })
  const multiCar = cars.length > 1

  // Guardian tab: section grouping by framing
  const insuranceSingleYear = insurances.filter((a) => {
    const framing = getFramingGroup(a.insurance?.insuranceType)
    return framing !== 'savings' && (a.insurance?.termYears ?? 0) <= 1
  })
  const insuranceMultiYear = insurances.filter((a) => {
    const framing = getFramingGroup(a.insurance?.insuranceType)
    return framing !== 'savings' && (a.insurance?.termYears ?? 0) > 1
  })
  const insuranceSavings = insurances.filter((a) => {
    return getFramingGroup(a.insurance?.insuranceType) === 'savings'
  })

  const dashedButton = (label: string) => (
    <button
      type="button"
      onClick={() => setSheetOpen(true)}
      style={{
        width: '100%',
        padding: '12px 14px',
        borderRadius: 14,
        border: '1px dashed var(--ink-3)',
        background: 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        color: 'var(--ink-2)',
        fontFamily: 'inherit',
        fontSize: 'var(--fs-label)',
        cursor: 'pointer',
      }}
    >
      <PlusIcon size={12} color="var(--ink-2)" /> {label}
    </button>
  )

  const typeVisible = (type: AssetType) => typeFilter === 'all' || typeFilter === type

  const TYPE_CHIPS: { key: AssetType | 'all'; label: string; color: string }[] = [
    { key: 'all', label: '全部', color: 'var(--ink-3)' },
    { key: 'house', label: '房', color: 'var(--asset-color-house)' },
    { key: 'car', label: '車', color: 'var(--asset-color-car)' },
    { key: 'child', label: '孩', color: 'var(--asset-color-child)' },
    { key: 'pet', label: '寵', color: 'var(--asset-color-pet)' },
    { key: 'plant', label: '植', color: 'var(--asset-color-plant)' },
    { key: 'item', label: '物', color: 'var(--asset-color-item, var(--ink-3))' },
  ]

  const TypeFilterStrip = (
    <div className="px-4 pb-3 overflow-x-auto">
      <div className="flex gap-2">
        {TYPE_CHIPS.map(({ key, label, color }) => {
          const active = typeFilter === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTypeFilter(key)}
              style={{
                background: active ? color : 'var(--surface)',
                color: active ? '#fff' : 'var(--ink-2)',
                border: active ? 'none' : '1px solid var(--hairline)',
              }}
              className="h-8 px-3 rounded-full text-sm flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              {key !== 'all' && (
                <span
                  aria-hidden
                  className="inline-block rounded-full shrink-0"
                  style={{ width: 6, height: 6, background: active ? 'rgba(255,255,255,0.7)' : color }}
                />
              )}
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )

  const hasProperty = (typeVisible('car') && cars.length > 0) || (typeVisible('house') && houses.length > 0)
  const hasLiving = (typeVisible('child') && children.length > 0) || (typeVisible('pet') && pets.length > 0) || (typeVisible('plant') && plants.length > 0)

  const defaultInsuranceData = {
    insuranceType: null,
    insured: null,
    insuredChildId: null,
    insuredChildName: null,
    insuredUserId: null,
    insuredUserDisplayName: null,
    policyHolderUserId: null,
    policyHolderDisplayName: null,
    policyHolderAvatarUrl: null,
    insurer: null,
    annualPremium: null,
    sumInsured: null,
    startsAt: null,
    expiryDate: null,
    termYears: null,
    payCycle: null,
    reminderDaysBefore: 30,
    notes: null,
  }

  const TabBar = (
    <div
      className="px-4 pb-3"
      role="tablist"
      aria-label={t.assets.title}
    >
      <div
        className="inline-flex rounded-full p-1"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--hairline)',
        }}
      >
        {(['aibutsu', 'guardian'] as const).map((id) => {
          const active = activeTab === id
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(id)}
              className="rounded-full transition-colors"
              style={{
                padding: '8px 12px',
                background: active ? 'var(--ink)' : 'transparent',
                color: active ? '#fff' : 'var(--ink-2)',
                fontFamily: 'inherit',
                fontSize: 'var(--fs-button)',
                fontWeight: active ? 600 : 500,
                border: 'none',
                cursor: 'pointer',
                letterSpacing: '0.2px',
              }}
            >
              {id === 'aibutsu' ? t.assets.tabs.aibutsu : t.assets.tabs.guardian}
            </button>
          )
        })}
      </div>
    </div>
  )

  const AibutsuTab = (
    <div className="px-4 flex flex-col gap-5">
      {hasProperty && (
        <div className="flex flex-col gap-3">
          <SectionLabel label={t.assets.section.property} dotColor="var(--asset-tint-house)" />
          {typeVisible('car') && cars.map((c) => (
            <CarHeroCard
              key={c.id}
              id={c.id}
              name={c.name}
              plate={c.plate}
              color={c.color ?? null}
              year={c.year ?? null}
              brand={c.brand ?? null}
              model={c.model ?? null}
              latestOdometer={c.latestOdometer ?? null}
              monthAmount={c.monthAmount}
              compact={multiCar}
              avgFuelEcon={c.avgFuelEcon ?? null}
              lastFuelDate={c.lastFuelDate ?? null}
            />
          ))}
          {typeVisible('car') && cars.length > 0 && dashedButton(multiCar ? t.assets.addCar : t.assets.addSecondCar)}
          {typeVisible('house') && houses.map((h) => (
            <HouseCard
              key={h.id}
              id={h.id}
              name={h.name}
              monthAmount={h.monthAmount}
              houseAddress={h.houseAddress ?? null}
            />
          ))}
        </div>
      )}

      {hasLiving && (
        <div className="flex flex-col gap-3">
          <SectionLabel label={t.assets.section.living} dotColor="var(--asset-tint-child)" />
          <div className="flex flex-col gap-2.5">
            {typeVisible('child') && children.map((c) => (
              <ChildCard
                key={c.id}
                id={c.id}
                name={c.name}
                nickname={c.nickname}
                monthAmount={c.monthAmount}
                childBirthday={c.childBirthday}
                childHeightCm={c.childHeightCm}
                childWeightG={c.childWeightG}
              />
            ))}
            {typeVisible('pet') && pets.map((p) => (
              <PetCard
                key={p.id}
                id={p.id}
                name={p.name}
                monthAmount={p.monthAmount}
                petSpecies={p.petSpecies}
                petBreed={p.petBreed}
                petBirthDate={p.petBirthDate}
                petWeightG={p.petWeightG}
              />
            ))}
            {typeVisible('plant') && plants.map((pl) => (
              <PlantCard
                key={pl.id}
                id={pl.id}
                name={pl.name}
                monthAmount={pl.monthAmount}
                plantLocation={pl.plantLocation}
                plantSproutedAt={pl.plantSproutedAt}
                plantWaterEvery={pl.plantWaterEvery}
              />
            ))}
          </div>
        </div>
      )}

      {typeVisible('item') && itemsTemplated.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionLabel label={t.assets.section.items} dotColor="var(--asset-tint-item)" />
          <div className="flex flex-col gap-2.5">
            {itemsTemplated.map((item) => (
              <ItemCard
                key={item.id}
                id={item.id}
                name={item.name}
                monthAmount={item.monthAmount}
                templateKey={item.type === 'item' ? 'item' : null}
                notes={undefined}
              />
            ))}
          </div>
        </div>
      )}

      {!hasProperty && !hasLiving && (!typeVisible('item') || itemsTemplated.length === 0) && (
        <div
          className="text-sm leading-relaxed py-10 text-center"
          style={{ color: 'var(--ink-3)' }}
        >
          {t.assets.tabEmpty.aibutsuHint}
        </div>
      )}
    </div>
  )

  const GuardianTab = (
    <div className="px-4 flex flex-col gap-5">
      {insurances.length > 0 ? (
        <>
          <GuardianSummary insurances={insurances} />

          {insuranceSingleYear.length > 0 && (
            <div className="flex flex-col gap-3">
              <SectionLabel label="保護型 · 一年期" dotColor="var(--asset-color-insurance)" />
              <div className="flex flex-col gap-2.5">
                {insuranceSingleYear.map((a) => (
                  <InsuranceListItem
                    key={a.id}
                    id={a.id}
                    name={a.name}
                    data={a.insurance ?? defaultInsuranceData}
                  />
                ))}
              </div>
            </div>
          )}

          {insuranceMultiYear.length > 0 && (
            <div className="flex flex-col gap-3">
              <SectionLabel label="保護型 · 多年期" dotColor="var(--asset-color-insurance)" />
              <div className="flex flex-col gap-2.5">
                {insuranceMultiYear.map((a) => (
                  <InsuranceListItem
                    key={a.id}
                    id={a.id}
                    name={a.name}
                    data={a.insurance ?? defaultInsuranceData}
                  />
                ))}
              </div>
            </div>
          )}

          {insuranceSavings.length > 0 && (
            <div className="flex flex-col gap-3">
              <SectionLabel label="儲蓄型" dotColor="var(--saving)" />
              <div className="flex flex-col gap-2.5">
                {insuranceSavings.map((a) => (
                  <InsuranceListItem
                    key={a.id}
                    id={a.id}
                    name={a.name}
                    data={a.insurance ?? defaultInsuranceData}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div
          className="text-sm leading-relaxed py-10 text-center"
          style={{ color: 'var(--ink-3)' }}
        >
          {t.assets.tabEmpty.guardianHint}
        </div>
      )}
    </div>
  )

  return (
    <div className="relative min-h-screen pb-[var(--bottom-nav-offset)]">
      {/* Page title */}
      <div className="px-5 pt-[max(env(safe-area-inset-top),24px)] pb-4">
        <div
          className="text-2xl font-medium tracking-tight"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}
        >
          {t.assets.title}
        </div>
      </div>

      {guardianVisible && TabBar}
      {activeTab === 'aibutsu' && TypeFilterStrip}

      {guardianGated ? (
        <GatedView />
      ) : items.length === 0 ? (
        <AssetEmptyState />
      ) : (
        <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {guardianVisible && activeTab === 'guardian' ? GuardianTab : AibutsuTab}
        </div>
      )}

      <BottomNav
        onAddClick={() => setSheetOpen(true)}
        hideFab={sheetOpen}
        fabVariant="accent"
      />

      {/* Create-only on this page; edits happen on /assets/[id] via the Hero ⋯ button.
       *  v0.15.2 #178 — when 守護 tab is active, pre-select 'insurance' so the
       *  FAB lands directly on the policy form instead of the default 'pet'. */}
      <AssetSheet
        open={sheetOpen}
        onClose={handleClose}
        initialType={activeTab === 'guardian' ? 'insurance' : undefined}
        onMutated={handleMutated}
      />
    </div>
  )
}
