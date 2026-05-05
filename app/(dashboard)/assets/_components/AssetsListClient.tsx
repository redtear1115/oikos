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

export interface AssetsListItem {
  id: string
  type: 'car' | 'house' | 'child' | 'insurance' | 'pet' | 'plant'
  name: string
  plate: string | null
  monthAmount: number
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
  const others = items.filter((a) => a.type !== 'car')
  const multi = cars.length > 1

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
        fontSize: 13,
        cursor: 'pointer',
      }}
    >
      <PlusIcon size={12} color="var(--ink-2)" /> {label}
    </button>
  )

  return (
    <div className="relative min-h-screen pb-[92px]">
      <div className="px-5 pt-[60px] pb-4">
        <div
          className="text-2xl font-medium tracking-tight"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}
        >
          愛物
        </div>
      </div>

      {items.length === 0 ? (
        <AssetEmptyState />
      ) : (
        <div className="px-4 flex flex-col gap-4">
          {cars.length > 0 && (
            <div className="flex flex-col" style={{ gap: 12 }}>
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
                  compact={multi}
                />
              ))}
              {dashedButton(multi ? '新增車輛' : '加入第二輛車')}
            </div>
          )}

          {others.length > 0 && (
            <div
              className="rounded-[20px] overflow-hidden"
              style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
            >
              {others.map((a, i) => (
                <AssetListItem
                  key={a.id}
                  id={a.id}
                  type={a.type}
                  name={a.name}
                  plate={a.plate ?? null}
                  monthAmount={a.monthAmount}
                  isLast={i === others.length - 1}
                />
              ))}
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
