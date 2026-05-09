'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import { TransactionFeed } from '@/app/(dashboard)/_components/TransactionFeed'
import { AddSheet, type AddSheetInitial } from '@/app/(dashboard)/dashboard/_components/AddSheet'
import { AssetSheet, type AssetSheetInitial } from '@/app/(dashboard)/assets/_components/AssetSheet'
import { useRealtimeEvents } from '@/app/(dashboard)/_components/RealtimeProvider'
import { AssetHero } from './AssetHero'
import { AssetSwitcher } from './AssetSwitcher'
import { FuelRow } from './FuelRow'
import { NewFuelLog, type NewFuelLogInitial } from './NewFuelLog'
import { SectionHeader, InfoCard } from './aibutsu-ui'
import type { PagedTxnRow } from '@/actions/transaction'
import { loadMoreTransactionsForAsset } from '@/actions/transaction'
import { useTranslations } from '@/lib/i18n/client'

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
  notes: string | null
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
  linkedInsurances?: { id: string; name: string }[]
}

export function AssetDetailClient({
  assetId, notes, assetSheetInitial, fuelType, primaryUserId,
  brand, model, year, initialOdometer,
  monthAmount, totalAmount, avgEcon,
  initialTxns, initialFuelLogs, pageSize, allAssets,
  linkedInsurances,
}: Props) {
  const router = useRouter()
  const t = useTranslations()
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
        notes: tx.notes,
        status: tx.status,
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

      {notes && (
        <>
          <SectionHeader>{t.assetDetail.notesSection}</SectionHeader>
          <InfoCard>
            <div className="px-4 py-3 whitespace-pre-wrap text-sm" style={{ color: 'var(--ink)' }}>
              {notes}
            </div>
          </InfoCard>
        </>
      )}

      <TransactionFeed
        initial={initialTxns}
        pageSize={pageSize}
        header={(count) => (
          <div className="flex items-center justify-between">
            <div className="text-micro tracking-[1.5px] uppercase" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>
              {t.assetDetail.timelineEntries.replace('{count}', String(count))}
            </div>
            {fuelType !== 'electric' && (
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="h-7 px-2.5 rounded-lg inline-flex items-center gap-1.5 text-micro font-medium"
                style={{ background: '#fff', border: '1px solid var(--hairline)', color: 'var(--ink-2)' }}
              >
                <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
                {t.assetDetail.addOtherExpense}
              </button>
            )}
          </div>
        )}
        onItemClick={handleTxItemClick}
        emptyState={
          <div className="text-center py-10 px-6 text-sm leading-relaxed" style={{ color: 'var(--ink-3)' }}>
            {assetSheetInitial.type === 'car'
              ? <>{t.assetDetail.emptyCarLine1}<br />{t.assetDetail.emptyCarLine2}</>
              : <>{t.assetDetail.emptyDefaultLine1}<br />{t.assetDetail.emptyDefaultLine2}</>
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

      {linkedInsurances && linkedInsurances.length > 0 && (
        <div className="mx-4 mt-3 mb-3 rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid var(--hairline)' }}>
          <div className="px-5 py-4">
            <div className="text-xs font-medium tracking-[0.5px] mb-2" style={{ color: 'var(--ink-3)' }}>
              {t.assetDetail.relatedInsurance}
            </div>
            {linkedInsurances.map((ins, i) => (
              <Link
                key={ins.id}
                href={`/assets/${ins.id}`}
                className="flex items-center gap-3 text-sm font-medium"
                style={{
                  color: 'var(--ink)',
                  paddingTop: i > 0 ? 12 : 0,
                  borderTop: i > 0 ? '1px solid var(--hairline)' : 'none',
                }}
              >
                <span>🛡</span>
                <span>{ins.name}</span>
                <span style={{ color: 'var(--ink-3)', marginLeft: 'auto' }}>›</span>
              </Link>
            ))}
          </div>
        </div>
      )}

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
              <span>{t.assetDetail.addOtherExpense}</span>
            </>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <rect x="3" y="4" width="9" height="13" rx="1" stroke="#fff" strokeWidth="1.6"/>
                <path d="M12 9h2a2 2 0 012 2v3a1 1 0 002 0V8l-2-2" stroke="#fff" strokeWidth="1.6" strokeLinecap="round"/>
                <path d="M5 7h5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
              <span>{t.assetDetail.refuel}</span>
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
