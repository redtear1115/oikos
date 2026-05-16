'use client'

import { useCallback, useRef, useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import { useRealtimeEvents } from '@/app/(dashboard)/_components/RealtimeProvider'
import { PlusIcon } from '@/app/(dashboard)/_components/PlusIcon'
import { AssetSheet } from './AssetSheet'
import { AssetListItem } from './AssetListItem'
import { InsuranceListItem } from './InsuranceListItem'
import { AssetEmptyState } from './AssetEmptyState'
import { CarHeroCard } from './CarHeroCard'
import { GatedView } from '@/app/(dashboard)/_components/GatedView'
import { useTranslations } from '@/lib/i18n/client'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
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

function AssetGroup({ group }: { group: AssetsListItem[] }) {
  return (
    <div
      className="rounded-[20px] overflow-hidden"
      style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
    >
      {group.map((a, i) => (
        <AssetListItem
          key={a.id}
          id={a.id}
          type={a.type}
          name={a.name}
          nickname={a.nickname ?? null}
          plate={a.plate ?? null}
          monthAmount={a.monthAmount}
          isSavings={a.isSavings}
          isLast={i === group.length - 1}
        />
      ))}
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

  // Refresh when partner adds/updates/deletes an asset
  useRealtimeEvents((event) => {
    if (event.kind === 'asset-changed' || event.kind === 'reconnect') {
      router.refresh()
    }
  })

  const tabParam = searchParams.get('tab')
  // #227 — when Guardian beta is OFF but the URL points at the guardian tab
  // (stale bookmark / browser back), show the GatedView in-place instead of
  // silently collapsing to 愛物. activeTab stays on 'aibutsu' so the data
  // arrays still resolve, but the body renders the gate.
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

  // Lightweight horizontal swipe between tabs. Threshold + axis check prevents
  // accidental triggers during vertical scroll.
  const touchRef = useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (e: React.TouchEvent) => {
    const t0 = e.touches[0]
    touchRef.current = { x: t0.clientX, y: t0.clientY }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchRef.current
    touchRef.current = null
    if (!start) return
    // No second tab to swipe to when Guardian beta is off — short-circuit.
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
  const livings = items.filter((a) => ['child', 'pet', 'plant'].includes(a.type))
  // #222 — template-based assets (type='item') get their own section so they
  // don't get mixed into the legacy cars / houses / livings grouping. Sorted
  // newest-first by createdAt order (already from the server query).
  const itemsTemplated = items.filter((a) => a.type === 'item')
  // Insurance ordered by expiry date ascending — soonest-to-expire first.
  // Items without an expiry date sink to the bottom (treated as +∞).
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

  const hasProperty = cars.length > 0 || houses.length > 0

  const TabBar = (
    <div
      className="px-4 pb-3"
      role="tablist"
      aria-label={t.assets.title}
    >
      <div
        className="flex rounded-full p-1"
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
              className="flex-1 rounded-full transition-colors"
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
          {cars.map((c) => (
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
            />
          ))}
          {cars.length > 0 && dashedButton(multiCar ? t.assets.addCar : t.assets.addSecondCar)}
          {houses.length > 0 && <AssetGroup group={houses} />}
        </div>
      )}

      {livings.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionLabel label={t.assets.section.living} dotColor="var(--asset-tint-child)" />
          <AssetGroup group={livings} />
        </div>
      )}

      {itemsTemplated.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionLabel label={t.assets.section.items} dotColor="var(--asset-tint-item)" />
          <AssetGroup group={itemsTemplated} />
        </div>
      )}

      {!hasProperty && livings.length === 0 && itemsTemplated.length === 0 && (
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
        <div className="flex flex-col gap-3">
          <SectionLabel label={t.assets.section.coverage} dotColor="var(--asset-tint-insurance)" />
          <div
            className="rounded-[20px] overflow-hidden"
            style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
          >
            {insurances.map((a, i) => (
              <InsuranceListItem
                key={a.id}
                id={a.id}
                name={a.name}
                data={a.insurance ?? {
                  insuranceType: null,
                  insured: null,
                  insuredChildId: null,
                  insuredChildName: null,
                  insuredUserId: null,
                  insuredUserDisplayName: null,
                  policyHolderUserId: null,
                  policyHolderDisplayName: null,
                  policyHolderAvatarUrl: null,
                  annualPremium: null,
                  sumInsured: null,
                  startsAt: null,
                  expiryDate: null,
                  termYears: null,
                  payCycle: null,
                  reminderDaysBefore: 30,
                  notes: null,
                }}
                isLast={i === insurances.length - 1}
              />
            ))}
          </div>
        </div>
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
      {/* Page title sits at the same vertical position as /settings + /records
          by honouring the safe-area inset (handles iOS notch) with a 24px
          floor (desktop / no-notch PWA). The previous hardcoded 60px only
          looked right on iOS — pushed the title down ~36px on desktop. */}
      <div className="px-5 pt-[max(env(safe-area-inset-top),24px)] pb-4">
        <div
          className="text-2xl font-medium tracking-tight"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}
        >
          {t.assets.title}
        </div>
      </div>

      {guardianGated ? (
        <GatedView />
      ) : items.length === 0 ? (
        <AssetEmptyState />
      ) : (
        <>
          {guardianVisible && TabBar}
          <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            {guardianVisible && activeTab === 'guardian' ? GuardianTab : AibutsuTab}
          </div>
        </>
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
