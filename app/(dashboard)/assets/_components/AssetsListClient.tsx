'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import { useRealtimeEvents } from '@/app/(dashboard)/_components/RealtimeProvider'
import { PlusIcon } from '@/app/(dashboard)/_components/PlusIcon'
import { AssetSheet } from './AssetSheet'
import { AssetListItem } from './AssetListItem'
import { AssetEmptyState } from './AssetEmptyState'
import { CarHeroCard } from './CarHeroCard'
import { useTranslations } from '@/lib/i18n/client'

export interface AssetsListItem {
  id: string
  type: 'car' | 'house' | 'child' | 'insurance' | 'pet' | 'plant'
  name: string
  /** Optional nickname (currently only populated for child assets). When
   *  present, list items render nickname-first with legal name as secondary. */
  nickname?: string | null
  plate: string | null
  monthAmount: number
  /** Insurance-only: true when InsuranceDetails.insurance_type === 'savings'.
   *  Drives the 「儲蓄」badge in AssetListItem. */
  isSavings?: boolean
  // Car-only extras (optional; ignored for non-car types)
  color?: string | null
  year?: number | null
  brand?: string | null
  model?: string | null
  latestOdometer?: number | null
  totalAmount?: number
  avgFuelEcon?: number | null
}

interface Props {
  items: AssetsListItem[]
}

export function AssetsListClient({ items }: Props) {
  const router = useRouter()
  const t = useTranslations()
  const [sheetOpen, setSheetOpen] = useState(false)

  // Refresh when partner adds/updates/deletes an asset
  useRealtimeEvents((event) => {
    if (event.kind === 'asset-changed' || event.kind === 'reconnect') {
      router.refresh()
    }
  })

  const handleClose = () => setSheetOpen(false)
  const handleMutated = () => router.refresh()

  const cars = items.filter((a) => a.type === 'car')
  const houses = items.filter((a) => a.type === 'house')
  const livings = items.filter((a) => ['child', 'pet', 'plant'].includes(a.type))
  const insurances = items.filter((a) => a.type === 'insurance')
  const multiCar = cars.length > 1

  const SectionLabel = ({ label }: { label: string }) => (
    <div
      className="text-xs font-medium tracking-[0.5px] px-1 pb-1"
      style={{ color: 'var(--ink-3)' }}
    >
      {label}
    </div>
  )

  const AssetGroup = ({ group }: { group: AssetsListItem[] }) => (
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

  return (
    <div className="relative min-h-screen pb-[92px]">
      <div className="px-5 pt-[60px] pb-4">
        <div
          className="text-2xl font-medium tracking-tight"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}
        >
          {t.assets.title}
        </div>
      </div>

      {items.length === 0 ? (
        <AssetEmptyState />
      ) : (
        <div className="px-4 flex flex-col gap-5">
          {hasProperty && (
            <div className="flex flex-col gap-3">
              <SectionLabel label={t.assets.section.property} />
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
                  totalAmount={c.totalAmount ?? 0}
                  avgFuelEcon={c.avgFuelEcon ?? null}
                  compact={multiCar}
                />
              ))}
              {cars.length > 0 && dashedButton(multiCar ? t.assets.addCar : t.assets.addSecondCar)}
              {houses.length > 0 && <AssetGroup group={houses} />}
            </div>
          )}

          {livings.length > 0 && (
            <div className="flex flex-col gap-3">
              <SectionLabel label={t.assets.section.living} />
              <AssetGroup group={livings} />
            </div>
          )}

          {insurances.length > 0 && (
            <div className="flex flex-col gap-3">
              <SectionLabel label={t.assets.section.coverage} />
              <AssetGroup group={insurances} />
            </div>
          )}
        </div>
      )}

      <BottomNav
        onAddClick={() => setSheetOpen(true)}
        hideFab={sheetOpen}
        fabVariant="accent"
      />

      {/* Create-only on this page; edits happen on /assets/[id] via the Hero ⋯ button. */}
      <AssetSheet
        open={sheetOpen}
        onClose={handleClose}
        onMutated={handleMutated}
      />
    </div>
  )
}
