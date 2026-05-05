'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import { TransactionFeed } from '@/app/(dashboard)/_components/TransactionFeed'
import { AddSheet, type AddSheetInitial } from '@/app/(dashboard)/dashboard/_components/AddSheet'
import { AssetSheet, type AssetSheetInitial } from '@/app/(dashboard)/assets/_components/AssetSheet'
import { useRealtimeEvents } from '@/app/(dashboard)/_components/RealtimeProvider'
import { AssetHero } from './AssetHero'
import { AssetActionBar } from './AssetActionBar'
import { FuelRow } from './FuelRow'
import { NewFuelLog, type NewFuelLogInitial } from './NewFuelLog'
import type { PagedTxnRow } from '@/actions/transaction'
import { loadMoreTransactionsForAsset } from '@/actions/transaction'

interface SerializedFuelLog {
  id: string
  liters: string
  odometer: number
  station: string | null
  loggedAt: string    // ISO
  prevOdometer: number | null
  fuelType: string
}

interface Props {
  assetId: string
  assetSheetInitial: AssetSheetInitial
  fuelType: '92' | '95' | '98' | 'diesel' | 'electric' | null
  primaryUserId: string | null
  monthAmount: number
  totalAmount: number
  monthFuel: number
  totalFuel: number
  avgEcon: number | null
  initialTxns: PagedTxnRow[]
  initialFuelLogs: SerializedFuelLog[]
  pageSize: number
}

export function AssetDetailClient({
  assetId, assetSheetInitial, fuelType, primaryUserId,
  monthAmount, totalAmount, avgEcon,
  initialTxns, initialFuelLogs, pageSize,
}: Props) {
  const router = useRouter()
  const [editAssetOpen, setEditAssetOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [editingTx, setEditingTx] = useState<AddSheetInitial | null>(null)
  const [fuelSheetOpen, setFuelSheetOpen] = useState(false)
  const [fuelSheetMode, setFuelSheetMode] = useState<'create' | 'edit'>('create')
  const [fuelSheetInitial, setFuelSheetInitial] = useState<NewFuelLogInitial | null>(null)

  // Build a map of fuelLogId → fuelLog for timeline row rendering
  const fuelLogMap = new Map(initialFuelLogs.map(f => [f.id, f]))
  // lastOdometer: most recent entry (array is DESC order from server)
  const lastOdometer = initialFuelLogs.length > 0 ? initialFuelLogs[0].odometer : null

  // Refresh when this asset changes (partner edit/delete) or WebSocket reconnect
  useRealtimeEvents((event) => {
    if (event.kind === 'reconnect') { router.refresh(); return }
    if (event.kind === 'asset-changed' && event.row.id === assetId) {
      if (event.row.deletedAt) router.replace('/assets')
      else router.refresh()
    }
  })

  const handleAssetMutated = (kind: 'saved' | 'deleted') => {
    if (kind === 'deleted') { router.replace('/assets'); return }
    router.refresh()
  }

  const handleTxItemClick = (tx: PagedTxnRow) => {
    if (tx.kind !== 'transaction') return

    if (tx.fuelLogId !== null) {
      // Tap on a fuel transaction → open NewFuelLog in edit mode
      const fuelLog = fuelLogMap.get(tx.fuelLogId)
      if (!fuelLog) return
      setFuelSheetMode('edit')
      setFuelSheetInitial({
        fuelLogId: tx.fuelLogId,
        transactionId: tx.id,
        liters: fuelLog.liters,
        odometer: fuelLog.odometer,
        station: fuelLog.station,
        fuelType: fuelLog.fuelType === '98' ? '98'
          : fuelLog.fuelType === 'diesel' ? 'diesel'
          : '95',
        loggedAt: fuelLog.loggedAt,
        cost: tx.amount,
        paidBy: tx.paidBy,
        splitType: tx.splitType ?? 'all_mine',
      })
      setFuelSheetOpen(true)
    } else {
      // Regular expense → AddSheet edit
      setEditingTx({
        id: tx.id,
        amount: tx.amount,
        description: tx.description,
        category: tx.category,
        splitType: tx.splitType!,
        payerId: tx.paidBy,
        transactedAt: tx.transactedAt,
        assetId,
      })
    }
  }

  const sheetOpen = addOpen || editingTx !== null || editAssetOpen || fuelSheetOpen
  const car = {
    id: assetId,
    name: assetSheetInitial.name,
    plate: assetSheetInitial.plate,
    fuelType: fuelType ?? '95' as const,
    primaryUserId,
  }

  return (
    <div className="relative min-h-screen pb-[92px]">
      <AssetHero
        name={assetSheetInitial.name}
        plate={assetSheetInitial.plate}
        fuelType={fuelType}
        monthAmount={monthAmount}
        totalAmount={totalAmount}
        avgEcon={avgEcon}
        fuelLogCount={initialFuelLogs.length}
      />

      <AssetActionBar
        fuelType={fuelType}
        onAddFuel={() => {
          setFuelSheetMode('create')
          setFuelSheetInitial(null)
          setFuelSheetOpen(true)
        }}
        onAddOther={() => setAddOpen(true)}
        onEdit={() => setEditAssetOpen(true)}
      />

      <TransactionFeed
        initial={initialTxns}
        pageSize={pageSize}
        onItemClick={handleTxItemClick}
        emptyState={
          <div className="text-center py-10 px-6 text-sm leading-relaxed" style={{ color: 'var(--ink-3)' }}>
            {fuelType === 'electric'
              ? '還沒有為這台車記下任何花費'
              : '還沒有加油記錄 — 戳上方「加油」開始'}
          </div>
        }
        loader={(cursor) => loadMoreTransactionsForAsset(assetId, cursor, pageSize)}
        acceptInsert={(row) => row.assetId === assetId}
        renderRow={(tx: PagedTxnRow) => {
          if (tx.fuelLogId !== null) {
            const fuelLog = fuelLogMap.get(tx.fuelLogId)
            if (fuelLog) {
              return (
                <FuelRow
                  fuelLog={fuelLog}
                  amount={tx.amount}
                  onClick={() => handleTxItemClick(tx)}
                />
              )
            }
          }
          return undefined
        }}
      />

      {/* FAB hidden on asset detail — AssetActionBar replaces it */}
      <BottomNav
        onAddClick={() => setAddOpen(true)}
        hideFab={true}
        fabVariant="primary"
      />

      <NewFuelLog
        open={fuelSheetOpen}
        onClose={() => setFuelSheetOpen(false)}
        car={car}
        lastOdometer={lastOdometer}
        mode={fuelSheetMode}
        initial={fuelSheetInitial}
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
