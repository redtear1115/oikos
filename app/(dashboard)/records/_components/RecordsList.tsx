'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AddSheet, type AddSheetInitial } from '@/app/(dashboard)/dashboard/_components/AddSheet'
import { SettlementSheet, type SettlementSheetInitial } from '@/app/(dashboard)/dashboard/_components/SettlementSheet'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import { TransactionFeed } from '@/app/(dashboard)/_components/TransactionFeed'
import { useRealtimeEvents } from '@/app/(dashboard)/_components/RealtimeProvider'
import { CompactRow } from '@/app/(dashboard)/dashboard/_components/CompactRow'
import { FilterSheet } from './FilterSheet'
import { MonthSwitcher } from './MonthSwitcher'
import { TabProvider } from './TabContext'
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
import { useTranslations } from '@/lib/i18n/client'

interface Props {
  initial: PagedTxnRow[]
  pageSize: number
  /**
   * Page-level month scope: drives both the stats card AND the transaction
   * feed. Server reads the URL param and feeds it down; client loaders close
   * over it so paginating stays inside the same calendar month.
   */
  monthKey: string
  /** Upper bound for MonthSwitcher (current Taipei month). */
  maxMonthKey: string
  /**
   * Server-rendered stats card. Re-renders when ?month / ?view in the URL
   * change; list state is preserved because RecordsList stays mounted across
   * those navigations.
   */
  statsSlot?: React.ReactNode
}

export function RecordsList({ initial, pageSize, monthKey, maxMonthKey, statsSlot }: Props) {
  const router = useRouter()
  const t = useTranslations()
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
      notes: tx.notes,
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

  // Loaders close over the current monthKey so paginating stays scoped to the
  // selected month. Recreated when month changes — TransactionFeed will use
  // the new loader on the next page-fetch (initial data is already month-
  // scoped via SSR, so no immediate refetch is needed).
  const tabLoader = useMemo(() => {
    if (tab === 'income') {
      return makeIncomeLoader(20, monthKey)
    }
    if (tab === 'expense') {
      return (cursor: TxnCursor | null) => loadMoreTransactions(cursor, 20, undefined, monthKey)
    }
    return (cursor: TxnCursor | null) => loadMoreFeedAll(cursor, 20, monthKey)
  }, [tab, monthKey])

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
      {/* Sticky header + tab bar */}
      <div
        className="sticky top-0 z-20 pb-1"
        style={{ background: 'var(--bg)' }}
      >
        <div className="px-5 pt-[max(env(safe-area-inset-top),24px)] pb-2 flex items-end justify-between">
          <div
            className="text-2xl font-medium tracking-tight"
            style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}
          >
            {t.records.title}
          </div>
          {tab !== 'income' && (
            <button
              onClick={() => setFilterOpen(true)}
              className="text-xs font-medium pb-1 cursor-pointer bg-transparent border-0 flex items-center gap-1"
              style={{ color: 'var(--ink-2)' }}
              aria-label={t.dashboard.filterAriaLabel}
            >
              {t.dashboard.filterLabel}{filterActive && <span style={{ color: 'var(--accent)' }}>•</span>} <span style={{ color: 'var(--ink-3)' }}>›</span>
            </button>
          )}
        </div>

        {/* Page-level month scope: controls both the stats card and the
            transaction feed below. Keeps stats and list in one mental model. */}
        <div className="px-5 pb-3">
          <MonthSwitcher monthKey={monthKey} maxMonthKey={maxMonthKey} />
        </div>

        {/* Tabs (left, primary) + recurring-rule settings (right, secondary).
            Two visually distinct pill styles in one row:
            - Tabs: solid pill, high-contrast — they're the page's primary
              control (drives stats title + feed kind).
            - Setting buttons: outline pill in the mode colour — secondary
              navigation to the recurring-rule settings page.
            On narrow viewports `flex-wrap` lets the right group drop to a
            second line; `ml-auto` keeps it right-aligned in either layout.
            Mode colours: 深咖啡 #7A5A38 (支出) / 薄荷綠 INCOME_PALETTE.ink (收入). */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 pb-3">
          <div className="flex items-center" style={{ gap: 8 }}>
            {([
              { id: 'all' as const,     label: t.records.tabAll },
              { id: 'expense' as const, label: t.records.tabExpense },
              { id: 'income' as const,  label: t.records.tabIncome },
            ]).map((tab2) => {
              const sel = tab === tab2.id
              const isIncome = tab2.id === 'income'
              return (
                <button
                  key={tab2.id}
                  type="button"
                  onClick={() => setTab(tab2.id)}
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
                  {tab2.label}
                </button>
              )
            })}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/settings/recurring-expense"
              className="h-8 px-3 rounded-full text-xs font-medium flex items-center gap-1 transition-colors duration-150"
              style={{
                color: '#7A5A38',
                border: '1px solid #7A5A3833',  // 20% alpha border = subtle outline
                background: 'var(--surface)',
              }}
            >
              <span aria-hidden style={{ fontSize: 11 }}>⚙</span>
              {t.records.manageRecurringExpense}
            </Link>
            <Link
              href="/settings/recurring-income"
              className="h-8 px-3 rounded-full text-xs font-medium flex items-center gap-1 transition-colors duration-150"
              style={{
                color: P.ink,
                border: `1px solid ${P.ink}33`,
                background: 'var(--surface)',
              }}
            >
              <span aria-hidden style={{ fontSize: 11 }}>⚙</span>
              {t.records.manageRecurringIncome}
            </Link>
          </div>
        </div>
      </div>

      {/* Stats above the transaction feed. The card adapts to the current tab
          via TabContext: title becomes 收支統計 / 支出統計 / 收入統計,
          income tab forces compact (no expense breakdown to show). */}
      <TabProvider value={tab}>{statsSlot}</TabProvider>

      {/* Each child below is a stable JSX sibling — React reconciles them by
          position, not as a list. We deliberately render `null` (rather than
          mounting a hidden TransactionFeed per tab) so only one feed exists
          in the DOM at a time; switching tabs unmounts the old one and the
          new one fetches its own page-1 cleanly via `key={tab}`. */}
      <TransactionFeed
        key={`${tab}:${monthKey}`}
        initial={tabInitial}
        pageSize={pageSize}
        monthKey={monthKey}
        onItemClick={handleItemClick}
        filter={tab !== 'income' ? (filter ?? undefined) : undefined}
        loader={tabLoader}
        renderRow={tab !== 'income' ? renderRow : undefined}
        emptyState={
          tab === 'income'
            ? <IncomeEmptyState />
            : (
              <div className="px-6 py-16 text-center text-sm" style={{ color: 'var(--ink-3)' }}>
                {filterActive ? t.feed.noFiltered : t.feed.noFilteredAddHint}
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

      {/* NewFuelLog is mounted lazily because its `car` prop is required and
          only known after the user taps a fuel-log row. Keep this conditional
          last so the slot order above (sheets) stays stable. */}
      {fuelCar !== null ? (
        <NewFuelLog
          open={fuelSheetOpen}
          onClose={() => setFuelSheetOpen(false)}
          car={fuelCar}
          lastOdometer={null}  // not available from records list context
          mode="edit"
          initial={fuelSheetInitial}
        />
      ) : null}
    </div>
  )
}
