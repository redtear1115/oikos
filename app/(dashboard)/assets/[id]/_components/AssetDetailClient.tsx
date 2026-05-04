'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import { TransactionFeed } from '@/app/(dashboard)/_components/TransactionFeed'
import { AddSheet, type AddSheetInitial } from '@/app/(dashboard)/dashboard/_components/AddSheet'
import { AssetSheet, type AssetSheetInitial } from '@/app/(dashboard)/assets/_components/AssetSheet'
import { useRealtimeEvents } from '@/app/(dashboard)/_components/RealtimeProvider'
import { AssetHero } from './AssetHero'
import type { PagedTxnRow } from '@/actions/transaction'
import { loadMoreTransactionsForAsset } from '@/actions/transaction'

interface Props {
  assetId: string
  assetSheetInitial: AssetSheetInitial
  monthAmount: number
  totalAmount: number
  initialTxns: PagedTxnRow[]
  pageSize: number
}

export function AssetDetailClient({
  assetId, assetSheetInitial, monthAmount, totalAmount, initialTxns, pageSize,
}: Props) {
  const router = useRouter()
  const [editAssetOpen, setEditAssetOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [editingTx, setEditingTx] = useState<AddSheetInitial | null>(null)

  // Refresh when this asset's row changes (e.g. partner edits/deletes it).
  // If the asset is soft-deleted, redirect to /assets.
  useRealtimeEvents((event) => {
    if (event.kind === 'asset-changed' && event.row.id === assetId && event.row.deletedAt) {
      router.replace('/assets')
      return
    }
    if (event.kind === 'asset-changed' || event.kind === 'reconnect') {
      router.refresh()
    }
  })

  // After AssetSheet edit/delete, navigate back if deleted (page reload will 404 otherwise)
  const handleAssetMutated = () => {
    // If we soft-deleted, the realtime event will fire and replace us to /assets.
    // For the edit case, just refresh to pick up new name/plate in hero.
    router.refresh()
  }

  const handleTxItemClick = (tx: PagedTxnRow) => {
    if (tx.kind !== 'transaction') return  // settlements never appear here
    setEditingTx({
      id: tx.id,
      amount: tx.amount,
      description: tx.description,
      category: tx.category,
      splitType: tx.splitType!,
      payerId: tx.paidBy,
      transactedAt: tx.transactedAt,
      assetId,  // pre-populate so the picker shows this car
    })
  }

  const sheetOpen = addOpen || editingTx !== null || editAssetOpen

  return (
    <div className="relative min-h-screen pb-[92px]">
      <AssetHero
        name={assetSheetInitial.name}
        plate={assetSheetInitial.plate}
        monthAmount={monthAmount}
        totalAmount={totalAmount}
        onEditClick={() => setEditAssetOpen(true)}
      />

      <TransactionFeed
        initial={initialTxns}
        pageSize={pageSize}
        onItemClick={handleTxItemClick}
        emptyState={
          <div className="text-center py-10 px-6 text-sm leading-relaxed" style={{ color: 'var(--ink-3)' }}>
            還沒有為這台車記下任何花費 —<br />戳右下角 + 開始
          </div>
        }
        loader={(cursor) => loadMoreTransactionsForAsset(assetId, cursor, pageSize)}
        acceptInsert={(row) => row.assetId === assetId}
      />

      <BottomNav
        onAddClick={() => setAddOpen(true)}
        hideFab={sheetOpen}
        fabVariant="primary"
      />

      <AddSheet
        open={addOpen || editingTx !== null}
        onClose={() => { setAddOpen(false); setEditingTx(null) }}
        initial={editingTx ?? undefined}
        prefilledAssetId={addOpen ? assetId : undefined}
        prefilledCategory={addOpen ? 'transit' : undefined}
        onMutated={() => router.refresh()}
      />

      <AssetSheet
        open={editAssetOpen}
        onClose={() => setEditAssetOpen(false)}
        initial={assetSheetInitial}
        onMutated={handleAssetMutated}
      />
    </div>
  )
}
