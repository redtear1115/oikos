'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AddSheet, type AddSheetInitial } from '@/app/(dashboard)/dashboard/_components/AddSheet'
import { SettlementSheet, type SettlementSheetInitial } from '@/app/(dashboard)/dashboard/_components/SettlementSheet'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import { TransactionFeed } from '@/app/(dashboard)/_components/TransactionFeed'
import { useRealtimeEvents } from '@/app/(dashboard)/_components/RealtimeProvider'
import { CompactRow } from '@/app/(dashboard)/dashboard/_components/CompactRow'
import { FilterSheet } from './FilterSheet'
import { defaultFilter, isFilterActive, type TxnFilter } from '@/lib/filter'
import type { PagedTxnRow } from '@/actions/transaction'
import { loadMoreFeedAll, loadMoreTransactions } from '@/actions/transaction'
import type { TxnCursor } from '@/lib/db/queries/transactions'
import { DEFAULT_INCOME_PALETTE } from '@/lib/incomePalettes'
import { makeIncomeLoader } from '@/lib/incomeFeedRow'
import { NewFuelLog, type NewFuelLogInitial } from '@/app/(dashboard)/assets/[id]/_components/NewFuelLog'
import { getFuelLogById } from '@/actions/fuelLog'
import { IncomeEmptyState } from '@/app/(dashboard)/dashboard/_components/IncomeEmptyState'
import { IncomeSheet, type IncomeSheetInitial } from '@/app/(dashboard)/dashboard/_components/IncomeSheet'

const incomeLoader = makeIncomeLoader(20)

interface Props {
  initial: PagedTxnRow[]
  pageSize: number
}

export function RecordsList({ initial, pageSize }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<'all' | 'expense' | 'income'>('all')
  const [editingTx, setEditingTx] = useState<AddSheetInitial | null>(null)
  const [editingSettlement, setEditingSettlement] = useState<SettlementSheetInitial | null>(null)
  const [adding, setAdding] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [filter, setFilter] = useState<TxnFilter | null>(null)

  // Fuel log edit sheet state
  const [fuelSheetOpen, setFuelSheetOpen] = useState(false)
  const [fuelSheetInitial, setFuelSheetInitial] = useState<NewFuelLogInitial | null>(null)
  const [fuelCar, setFuelCar] = useState<{
    id: string; name: string; plate: string
    fuelType: '92' | '95' | '98' | 'diesel' | 'electric' | null
    primaryUserId: string | null
  } | null>(null)
  const [, startFuelLoad] = useTransition()

  // Income edit sheet state
  const [editingIncome, setEditingIncome] = useState<IncomeSheetInitial | null>(null)

  const sheetOpen = editingTx !== null || editingSettlement !== null || adding || filterOpen || fuelSheetOpen || editingIncome !== null

  useRealtimeEvents((event) => {
    if (event.kind === 'income-insert' || event.kind === 'income-update') {
      router.refresh()
    }
  })

  const handleItemClick = (tx: PagedTxnRow) => {
    if (tx.kind === 'income') {
      setEditingIncome({
        id: tx.id,
        amount: tx.amount,
        category: tx.category,
        recipientId: tx.paidBy,
        occurredAt: tx.transactedAt.substring(0, 10),
        source: tx.description || null,
        assetId: tx.assetId,
      })
      return
    }

    if (tx.kind === 'settlement') {
      setEditingSettlement({
        id: tx.id,
        amount: tx.amount,
        payerId: tx.paidBy,
        settledAt: tx.transactedAt,
      })
      return
    }

    if (tx.fuelLogId !== null) {
      // Fuel transaction → load fuel log detail and open NewFuelLog in edit mode
      startFuelLoad(async () => {
        const detail = await getFuelLogById(tx.fuelLogId!)
        if (!detail) return  // stale or unauthorized — silently skip
        setFuelSheetInitial({
          fuelLogId: detail.id,
          transactionId: tx.id,
          liters: detail.liters,
          odometer: detail.odometer,
          station: detail.station,
          fuelType: detail.fuelType === '98' ? '98' : detail.fuelType === 'diesel' ? 'diesel' : '95',
          loggedAt: detail.loggedAt,
          cost: tx.amount,
          paidBy: tx.paidBy,
          splitType: tx.splitType ?? 'all_mine',
        })
        setFuelCar({
          id: detail.assetId,
          name: detail.carName,
          plate: detail.carPlate ?? '',
          fuelType: detail.carFuelType,
          primaryUserId: detail.carPrimaryUserId,
        })
        setFuelSheetOpen(true)
      })
      return
    }

    setEditingTx({
      id: tx.id,
      amount: tx.amount,
      description: tx.description,
      category: tx.category,
      splitType: tx.splitType!,
      payerId: tx.paidBy,
      transactedAt: tx.transactedAt,
      assetId: tx.assetId,
    })
  }

  const handleSheetClose = () => {
    setEditingTx(null)
    setEditingSettlement(null)
    setAdding(false)
    setEditingIncome(null)
  }

  const handleMutated = () => router.refresh()

  const filterActive = filter !== null && isFilterActive(filter)

  // Tab-filtered initial data
  const tabInitial = useMemo(() => {
    if (tab === 'expense') return initial.filter(r => r.kind !== 'income')
    if (tab === 'income') return initial.filter(r => r.kind === 'income')
    return initial
  }, [initial, tab])

  const tabLoader =
    tab === 'income'
      ? incomeLoader
      : tab === 'expense'
      ? (cursor: TxnCursor | null) => loadMoreTransactions(cursor, 20)
      : loadMoreFeedAll

  // Income row mint-glow renderer (used in 'all' tab only)
  const P = DEFAULT_INCOME_PALETTE
  const renderRow = (tx: PagedTxnRow): React.ReactNode | undefined => {
    if (tx.kind !== 'income') return undefined
    return (
      <div
        style={{
          background: `linear-gradient(90deg, ${P.glow}55, transparent 60%)`,
        }}
      >
        <CompactRow tx={tx} isLast={false} onClick={() => handleItemClick(tx)} />
      </div>
    )
  }

  return (
    <div className="relative min-h-dvh pb-[92px]">
      <div className="px-5 pt-[max(env(safe-area-inset-top),24px)] pb-2 flex items-end justify-between">
        <div
          className="text-2xl font-medium tracking-tight"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}
        >
          紀錄
        </div>
        {tab !== 'income' && (
          <button
            onClick={() => setFilterOpen(true)}
            className="text-xs font-medium pb-1 cursor-pointer bg-transparent border-0 flex items-center gap-1"
            style={{ color: 'var(--ink-2)' }}
            aria-label="開啟篩選"
          >
            篩選{filterActive && <span style={{ color: 'var(--accent)' }}>•</span>} <span style={{ color: 'var(--ink-3)' }}>›</span>
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div
        className="flex items-center px-5 pb-4"
        style={{ gap: 8 }}
      >
        {([
          { id: 'all',     label: '全部' },
          { id: 'expense', label: '支出' },
          { id: 'income',  label: '進帳' },
        ] as const).map((t) => {
          const sel = tab === t.id
          const isIncome = t.id === 'income'
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className="h-8 px-4 rounded-full text-sm font-medium cursor-pointer border-0 transition-all duration-150"
              style={{
                background: sel
                  ? (isIncome ? P.tint : 'var(--ink)')
                  : 'var(--surface)',
                color: sel
                  ? (isIncome ? P.ink : '#fff')
                  : 'var(--ink-2)',
                border: sel ? 'none' : '1px solid var(--hairline)',
              }}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      <TransactionFeed
        key={tab}
        initial={tabInitial}
        pageSize={pageSize}
        onItemClick={handleItemClick}
        filter={tab !== 'income' ? (filter ?? undefined) : undefined}
        loader={tabLoader}
        renderRow={tab !== 'income' ? renderRow : undefined}
        emptyState={
          tab === 'income'
            ? <IncomeEmptyState />
            : (
              <div className="px-6 py-16 text-center text-sm" style={{ color: 'var(--ink-3)' }}>
                {filterActive
                  ? '沒有符合條件的紀錄'
                  : '還沒有紀錄。按下方 + 記第一筆吧。'}
              </div>
            )
        }
      />

      <BottomNav onAddClick={() => setAdding(true)} hideFab={sheetOpen} />

      <AddSheet
        open={adding || editingTx !== null}
        onClose={handleSheetClose}
        initial={editingTx ?? undefined}
        onMutated={handleMutated}
      />
      <SettlementSheet
        open={editingSettlement !== null}
        onClose={handleSheetClose}
        initial={editingSettlement}
        onMutated={handleMutated}
      />
      <FilterSheet
        open={filterOpen}
        current={filter ?? defaultFilter()}
        onClose={() => setFilterOpen(false)}
        onApply={(next) => {
          setFilter(isFilterActive(next) ? next : null)
          setFilterOpen(false)
        }}
      />

      <IncomeSheet
        open={editingIncome !== null}
        onClose={handleSheetClose}
        initial={editingIncome ?? undefined}
        onMutated={handleMutated}
      />

      {fuelCar && (
        <NewFuelLog
          open={fuelSheetOpen}
          onClose={() => setFuelSheetOpen(false)}
          car={fuelCar}
          lastOdometer={null}  // not available from records list context
          mode="edit"
          initial={fuelSheetInitial}
        />
      )}
    </div>
  )
}
