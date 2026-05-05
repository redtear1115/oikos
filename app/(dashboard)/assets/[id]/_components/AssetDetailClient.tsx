'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import { TransactionFeed } from '@/app/(dashboard)/_components/TransactionFeed'
import { AddSheet, type AddSheetInitial } from '@/app/(dashboard)/dashboard/_components/AddSheet'
import { AssetSheet, type AssetSheetInitial } from '@/app/(dashboard)/assets/_components/AssetSheet'
import { useRealtimeEvents } from '@/app/(dashboard)/_components/RealtimeProvider'
import { AssetHero } from './AssetHero'
import { AssetSwitcher } from './AssetSwitcher'
import { isDarkColor, FALLBACK_CAR_COLOR } from '../../_components/carColor'
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
  brand: string | null
  model: string | null
  year: number | null
  initialOdometer: number | null
  monthAmount: number
  totalAmount: number
  monthFuel: number
  totalFuel: number
  avgEcon: number | null
  initialTxns: PagedTxnRow[]
  initialFuelLogs: SerializedFuelLog[]
  pageSize: number
  allAssets: Array<{ id: string; name: string; type: 'car' | 'house' | 'child' | 'insurance' | 'pet' | 'plant' }>
}

export function AssetDetailClient({
  assetId, assetSheetInitial, fuelType, primaryUserId,
  brand, model, year, initialOdometer,
  monthAmount, totalAmount, avgEcon,
  initialTxns, initialFuelLogs, pageSize, allAssets,
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
  // lastOdometer: most recent entry (array is DESC order from server), fallback to initialOdometer
  const lastOdometer = initialFuelLogs.length > 0
    ? initialFuelLogs[0].odometer
    : (initialOdometer ?? null)

  // Refresh when this asset changes (partner edit/delete) or WebSocket reconnect
  useRealtimeEvents((event) => {
    if (event.kind === 'reconnect') { router.refresh(); return }
    if (event.kind === 'asset-changed' && event.row.id === assetId) {
      if (event.row.deletedAt) router.replace('/assets')
      else router.refresh()
    }
    // Partner added/edited/deleted a fuel log for this car → refresh timeline + hero
    if (event.kind === 'fuel-log-changed' && event.row.assetId === assetId) {
      router.refresh()
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

  const car = {
    id: assetId,
    name: assetSheetInitial.name,
    plate: assetSheetInitial.plate ?? '',
    fuelType: fuelType ?? '95' as const,
    primaryUserId,
  }

  return (
    <div className="relative min-h-screen pb-[92px]">
      <AssetHero
        name={
          <AssetSwitcher
            currentAssetId={assetId}
            allAssets={allAssets}
            chevronInk={isDarkColor(assetSheetInitial.color ?? FALLBACK_CAR_COLOR) ? '#FFF6EC' : '#3A2419'}
          >
            <span>{assetSheetInitial.name}</span>
          </AssetSwitcher>
        }
        plate={assetSheetInitial.plate ?? null}
        brand={brand}
        model={model}
        year={year}
        fuelType={fuelType}
        color={assetSheetInitial.color ?? null}
        monthAmount={monthAmount}
        totalAmount={totalAmount}
        avgEcon={avgEcon}
        fuelLogCount={initialFuelLogs.length}
        onEdit={() => setEditAssetOpen(true)}
      />

      <TransactionFeed
        initial={initialTxns}
        pageSize={pageSize}
        header={(count) => (
          <div className="flex items-center justify-between">
            <div className="text-[11px] tracking-[1.5px] uppercase" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>
              時間軸 · {count} 筆
            </div>
            {fuelType !== 'electric' && (
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="h-7 px-2.5 rounded-lg inline-flex items-center gap-1.5 text-[11px] font-medium"
                style={{ background: '#fff', border: '1px solid var(--hairline)', color: 'var(--ink-2)' }}
              >
                <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
                其他花費
              </button>
            )}
          </div>
        )}
        onItemClick={handleTxItemClick}
        emptyState={
          <div className="text-center py-10 px-6 text-sm leading-relaxed" style={{ color: 'var(--ink-3)' }}>
            {assetSheetInitial.type === 'car'
              ? <>還沒有為這台車記下任何花費 —<br />戳右下角 + 開始</>
              : <>還沒有記下任何花費 —<br />戳右下角 + 開始</>
            }
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

      {/* Car detail FAB: 加油 (gas) / 其他花費 (electric) */}
      <BottomNav
        onAddClick={() => {
          if (fuelType === 'electric') {
            setAddOpen(true)
          } else {
            setFuelSheetMode('create')
            setFuelSheetInitial(null)
            setFuelSheetOpen(true)
          }
        }}
        fabVariant="primary"
        fabContent={
          fuelType === 'electric' ? (
            <>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M10 3v14M3 10h14" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              <span>其他花費</span>
            </>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <rect x="3" y="4" width="9" height="13" rx="1" stroke="#fff" strokeWidth="1.6"/>
                <path d="M12 9h2a2 2 0 012 2v3a1 1 0 002 0V8l-2-2" stroke="#fff" strokeWidth="1.6" strokeLinecap="round"/>
                <path d="M5 7h5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
              <span>加油</span>
            </>
          )
        }
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
