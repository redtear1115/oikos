'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import { useRealtimeEvents } from '@/app/(dashboard)/_components/RealtimeProvider'
import { AssetSheet } from './AssetSheet'
import { AssetListItem } from './AssetListItem'
import { AssetEmptyState } from './AssetEmptyState'

export interface AssetsListItem {
  id: string
  type: 'car' | 'house' | 'child' | 'insurance' | 'pet' | 'plant'
  name: string
  plate: string | null
  monthAmount: number
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

  return (
    <div className="relative min-h-screen pb-[92px]">
      <div className="px-5 pt-[60px] pb-4">
        <div
          className="text-2xl font-medium tracking-tight"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}
        >
          資產
        </div>
      </div>

      {items.length === 0 ? (
        <AssetEmptyState />
      ) : (
        <div className="px-4">
          <div
            className="rounded-[20px] overflow-hidden"
            style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
          >
            {items.map((a, i) => (
              <AssetListItem
                key={a.id}
                id={a.id}
                type={a.type}
                name={a.name}
                plate={a.plate ?? null}
                monthAmount={a.monthAmount}
                isLast={i === items.length - 1}
              />
            ))}
          </div>
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
