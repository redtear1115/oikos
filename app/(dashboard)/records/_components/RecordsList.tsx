'use client'

import { useState, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { AddSheetInitial } from '@/app/(dashboard)/dashboard/_components/AddSheet'
import type { SettlementSheetInitial } from '@/app/(dashboard)/dashboard/_components/SettlementSheet'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import { TransactionFeed } from '@/app/(dashboard)/_components/TransactionFeed'
import { useRealtimeEvents } from '@/app/(dashboard)/_components/RealtimeProvider'
import { CompactRow } from '@/app/(dashboard)/dashboard/_components/CompactRow'
import Link from 'next/link'
import type { AssetOption } from './FilterSheet'
import { MonthSwitcher } from './MonthSwitcher'
import { DateRangeChip } from './DateRangeChip'
import { TabProvider, type RecordsTab } from './TabContext'
import {
  applyDateRangeToParams,
  applyFilterToParams,
  defaultFilter,
  isFilterActive,
  parseFilterFromSearchParams,
  toWire,
  type DateRange,
  type TxnFilter,
} from '@/lib/filter'
import {
  applyDrillToParams,
  drillAppliesToTab,
  drillKey,
  parseDrillFromSearchParams,
  toDrillWire,
  type DrillFilter,
} from '@/lib/drill'
import type { PagedTxnRow } from '@/actions/transaction'
import { loadMoreFeedAll, loadMoreTransactions } from '@/actions/transaction'
import type { TxnCursor } from '@/lib/db/queries/transactions'
import { DEFAULT_INCOME_PALETTE } from '@/lib/incomePalettes'
import { makeIncomeLoader } from '@/lib/incomeFeedRow'
import { NewFuelLog } from '@/app/(dashboard)/assets/[id]/_components/NewFuelLog'
import { useFuelSheet } from './useFuelSheet'
import { IncomeEmptyState } from '@/app/(dashboard)/dashboard/_components/IncomeEmptyState'
import type { IncomeSheetInitial } from '@/app/(dashboard)/dashboard/_components/IncomeSheet'
import { DrillFilterChip } from './DrillFilterChip'
import { useTranslations } from '@/lib/i18n/client'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'

// Sheets are heavy and only meaningful on user interaction. Split into
// separate chunks and skip SSR so they don't bloat the initial Records
// bundle. (#616)
const AddSheet = dynamic(
  () => import('@/app/(dashboard)/dashboard/_components/AddSheet').then((m) => m.AddSheet),
  { ssr: false },
)
const SettlementSheet = dynamic(
  () => import('@/app/(dashboard)/dashboard/_components/SettlementSheet').then((m) => m.SettlementSheet),
  { ssr: false },
)
const IncomeSheet = dynamic(
  () => import('@/app/(dashboard)/dashboard/_components/IncomeSheet').then((m) => m.IncomeSheet),
  { ssr: false },
)
const FilterSheet = dynamic(() => import('./FilterSheet').then((m) => m.FilterSheet), { ssr: false })

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
   * Resolved date range. When `kind === 'month'`, the legacy MonthSwitcher
   * controls the scope. When `kind === 'range'` or `kind === 'all'`, the
   * structured filter is in effect: MonthSwitcher is hidden and replaced by
   * a DateRangeChip showing the active range with a one-tap clear.
   */
  dateRange: DateRange
  /**
   * Asset name for the active asset drill, resolved server-side. The chip
   * needs the human name and the client doesn't have it — pre-fetching here
   * avoids an extra round-trip on first paint. Null when no asset drill or
   * when the drill targets the「其他」(no-asset) bar.
   */
  drillAssetName?: string | null
  /**
   * Active assets in the group, used to populate the FilterSheet's 愛物
   * multi-select. Sorted by createdAt server-side; we forward verbatim.
   */
  assets: AssetOption[]
  /**
   * Server-rendered stats card. Re-renders when ?month / ?view in the URL
   * change; list state is preserved because RecordsList stays mounted across
   * those navigations.
   */
  statsSlot?: React.ReactNode
}

export function RecordsList({
  initial,
  pageSize,
  monthKey,
  maxMonthKey,
  dateRange,
  drillAssetName,
  assets,
  statsSlot,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations()
  const { isPast } = useMember()
  // L2 dual toggle — internal state is the set of selected kinds; both
  // selected = 全部. Downstream (TabContext, stats title, feed loader,
  // drill-applies-to-tab) keeps the legacy `'all' | 'expense' | 'income'`
  // shape via `tab` derived below.
  const [selectedKinds, setSelectedKinds] = useState<Set<'expense' | 'income'>>(
    () => new Set(['expense', 'income']),
  )
  const tab: RecordsTab =
    selectedKinds.size === 2
      ? 'all'
      : selectedKinds.has('expense')
        ? 'expense'
        : 'income'

  // Drill is URL-derived: we read live state from useSearchParams so a
  // tap-bar handler that just calls router.replace reflects here on the very
  // next render. The server (page.tsx) reads the same params so SSR initial
  // is already drill-filtered — no separate prop needed.
  const drill = useMemo<DrillFilter | null>(() => parseDrillFromSearchParams(searchParams), [searchParams])
  // Effective drill — the active drill iff it's meaningful for the current tab.
  // We keep the URL value as-is across tab switches but skip applying it on
  // tabs where it would always return zero rows (e.g. expense-cat drill on the
  // 收入 tab); drillKey participates in the feed key so a re-mount happens
  // when the effective state flips.
  const effectiveDrill = drillAppliesToTab(drill, tab) ? drill : null
  const effectiveDrillKey = drillKey(effectiveDrill)
  const effectiveDrillWire = effectiveDrill ? toDrillWire(effectiveDrill) : undefined

  // Structured filter — also URL-derived. Server SSR already applied it; the
  // client mirrors via useSearchParams so the FilterSheet's "current state"
  // and the loaders / realtime row predicate share one source of truth.
  const filter = useMemo<TxnFilter>(() => parseFilterFromSearchParams(searchParams), [searchParams])
  const filterActive = isFilterActive(filter)
  const filterWire = filterActive ? toWire(filter) : undefined
  // For TransactionFeed.filter — only pass when active so the empty-state
  // logic in TransactionFeed correctly distinguishes "no filter" from
  // "filter that excluded everything".
  const feedFilterProp = filterActive ? filter : undefined
  // dateRange travels through to the loaders. SSR already used it for the
  // initial page; the loaders need it for pagination.
  const dateRangeForLoader = dateRange.kind === 'month' ? undefined : dateRange
  const monthKeyForLoader = dateRange.kind === 'month' ? monthKey : undefined

  const handleClearDrill = () => {
    const params = new URLSearchParams(searchParams.toString())
    applyDrillToParams(params, null)
    const qs = params.toString()
    router.replace(`/records${qs ? `?${qs}` : ''}`, { scroll: false })
  }

  const handleClearDateRange = () => {
    const params = new URLSearchParams(searchParams.toString())
    applyDateRangeToParams(params, { kind: 'month', monthKey: maxMonthKey })
    const qs = params.toString()
    router.replace(`/records${qs ? `?${qs}` : ''}`, { scroll: false })
  }

  /**
   * Build a shareable URL by serializing the current filter, date range, and
   * drill into URL params. Used by the FilterSheet's "分享連結" button.
   * Returns the absolute href (origin included) so it's safe to drop into
   * any messaging app without context.
   */
  const buildShareUrl = (next: TxnFilter, nextRange: DateRange) => {
    const params = new URLSearchParams()
    applyFilterToParams(params, next)
    applyDateRangeToParams(params, nextRange)
    if (drill) applyDrillToParams(params, drill)
    const qs = params.toString()
    const path = `/records${qs ? `?${qs}` : ''}`
    if (typeof window === 'undefined') return path
    return `${window.location.origin}${path}`
  }

  const [editingTx, setEditingTx] = useState<AddSheetInitial | null>(null)
  const [editingSettlement, setEditingSettlement] = useState<SettlementSheetInitial | null>(null)
  const [adding, setAdding] = useState(false)
  const [addingIncomeNew, setAddingIncomeNew] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)

  // Fuel log edit sheet — open/initial/car/load-transition bundled in one hook.
  const fuel = useFuelSheet()

  // Income edit sheet state
  const [editingIncome, setEditingIncome] = useState<IncomeSheetInitial | null>(null)

  const sheetOpen = editingTx !== null || editingSettlement !== null || adding || addingIncomeNew || filterOpen || fuel.open || editingIncome !== null

  useRealtimeEvents((event) => {
    if (event.kind === 'income-insert' || event.kind === 'income-update') {
      router.refresh()
    }
  })

  const handleItemClick = (tx: PagedTxnRow) => {
    // Past-epoch view is read-only — never open an edit sheet.
    if (isPast) return
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
      // Fuel transaction → load fuel log detail and open NewFuelLog in edit mode.
      fuel.openFromTx(tx)
      return
    }

    setEditingTx({
      id: tx.id,
      amount: tx.amount,
      description: tx.description,
      category: tx.category,
      splitType: tx.splitType!,
      splitRatioA: tx.splitRatioA ?? null,
      payerId: tx.paidBy,
      transactedAt: tx.transactedAt,
      assetId: tx.assetId,
      notes: tx.notes,
      status: tx.status,
    })
  }

  const handleSheetClose = () => {
    setEditingTx(null)
    setEditingSettlement(null)
    setAdding(false)
    setAddingIncomeNew(false)
    setEditingIncome(null)
  }

  const handleMutated = () => router.refresh()

  // Tab-filtered initial data
  const tabInitial = useMemo(() => {
    if (tab === 'expense') return initial.filter(r => r.kind !== 'income')
    if (tab === 'income') return initial.filter(r => r.kind === 'income')
    return initial
  }, [initial, tab])

  // Loaders close over the current monthKey/dateRange + structured filter +
  // effective drill so paginating stays scoped to the same view as SSR.
  // Recreated when any of those change — TransactionFeed will use the new
  // loader on the next page fetch. (Initial data is already SSR-scoped, so
  // no immediate refetch is needed for that flow.)
  const tabLoader = useMemo(() => {
    if (tab === 'income') {
      return makeIncomeLoader(20, monthKeyForLoader, effectiveDrillWire, filterWire, dateRangeForLoader)
    }
    if (tab === 'expense') {
      return (cursor: TxnCursor | null) =>
        loadMoreTransactions(cursor, 20, filterWire, monthKeyForLoader, effectiveDrillWire, dateRangeForLoader)
    }
    return (cursor: TxnCursor | null) =>
      loadMoreFeedAll(cursor, 20, monthKeyForLoader, effectiveDrillWire, filterWire, dateRangeForLoader)
  }, [tab, monthKeyForLoader, effectiveDrillWire, filterWire, dateRangeForLoader])

  // Toggle one kind of the L2 dual-pill. Disallow deselecting the last
  // selected kind — there's no useful "neither" state, and we want the toggle
  // to read as "subtract a slice" rather than "off". If the resulting tab
  // can't apply the active drill, strip it so SSR initial + chip stay
  // coherent the next time the user lands on this tab.
  const toggleKind = (kind: 'expense' | 'income') => {
    const next = new Set(selectedKinds)
    if (next.has(kind)) {
      if (next.size === 1) return
      next.delete(kind)
    } else {
      next.add(kind)
    }
    setSelectedKinds(next)
    const nextTab: RecordsTab =
      next.size === 2 ? 'all' : next.has('expense') ? 'expense' : 'income'
    if (drill && !drillAppliesToTab(drill, nextTab)) {
      handleClearDrill()
    }
  }

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

  const handleApplyFilter = (next: TxnFilter, nextRange?: DateRange) => {
    const params = new URLSearchParams(searchParams.toString())
    applyFilterToParams(params, next)
    // /records always passes a concrete dateRange — the optional `?` here is
    // only because FilterSheet supports a lite mode for /dashboard.
    if (nextRange) applyDateRangeToParams(params, nextRange)
    const qs = params.toString()
    router.replace(`/records${qs ? `?${qs}` : ''}`, { scroll: false })
    setFilterOpen(false)
  }

  // Date-range key — used in the feed key so a date-range change triggers a
  // clean remount the same way drill changes do.
  const dateRangeKey = dateRange.kind === 'month'
    ? `m:${dateRange.monthKey}`
    : dateRange.kind === 'range'
      ? `r:${dateRange.start}:${dateRange.end}`
      : 'all'

  return (
    <div className="relative min-h-dvh pb-[var(--bottom-nav-offset)]">
      {/* Sticky header */}
      <div
        className="sticky top-0 z-20"
        style={{ background: 'var(--bg)' }}
      >
        {/* L1Header — unified across Dashboard / Records / Assets (#545 §1).
            pb-3 matches Assets L1 — keeps the title's breathing room while
            tightening the row a notch vs the earlier pb-4. */}
        <div className="px-5 pt-[max(env(safe-area-inset-top),24px)] pb-3 flex items-center justify-between">
          <div
            className="text-2xl font-medium tracking-tight"
            style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}
          >
            {t.records.title}
          </div>
          {/* Recurring entry — moved from the inline section card (#545 §4)
              to keep L3 focused on time/filter chips. */}
          <Link
            href="/settings/recurring"
            className="text-sm no-underline flex items-center gap-1 cursor-pointer"
            style={{ color: 'var(--ink-2)' }}
          >
            {t.records.recurringShortcut}
            <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>›</span>
          </Link>
        </div>

        {/* L2: dual toggle pill — 支出 + 收入 wrapped in one pill (#545 §3).
            Both selected = 全部 (no separate "all" pill). Disallow zero-
            selected — see toggleKind for why. */}
        <div className="px-5 pb-3">
          <div
            className="inline-flex items-center"
            style={{
              background: 'var(--surface)',
              border: '0.5px solid var(--hairline)',
              borderRadius: 999,
              padding: 3,
              gap: 2,
            }}
          >
            {([
              { kind: 'expense' as const, label: t.records.tabExpense, dotColor: 'rgba(255,255,255,0.55)' },
              { kind: 'income' as const, label: t.records.tabIncome, dotColor: '#3F6A56' },
            ]).map(({ kind, label, dotColor }) => {
              const sel = selectedKinds.has(kind)
              const isIncome = kind === 'income'
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => toggleKind(kind)}
                  className="h-8 inline-flex items-center gap-[5px] cursor-pointer border-0 text-sm transition-colors duration-150"
                  style={{
                    padding: '0 14px',
                    borderRadius: 999,
                    background: sel ? (isIncome ? P.tint : 'var(--ink)') : 'transparent',
                    color: sel ? (isIncome ? P.ink : '#fff') : 'var(--ink-3)',
                    fontWeight: sel ? 600 : 500,
                  }}
                  aria-pressed={sel}
                >
                  {sel && (
                    <span
                      aria-hidden
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: '50%',
                        background: dotColor,
                        opacity: isIncome ? 0.7 : 1,
                        flexShrink: 0,
                      }}
                    />
                  )}
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* L3: month/date chip + filter chip + drill chips — single scrolling row.
            All "narrow the view" controls live here so the mental model is unified:
            L2 = what type of record, L3 = what time / filter / drill scope. */}
        <div
          className="flex items-center gap-2 px-5 pb-3 overflow-x-auto"
          style={{ scrollbarWidth: 'none' } as React.CSSProperties}
        >
          {/* Month or date range chip */}
          {dateRange.kind === 'month' ? (
            <MonthSwitcher monthKey={monthKey} maxMonthKey={maxMonthKey} />
          ) : (
            <DateRangeChip dateRange={dateRange} onClear={handleClearDateRange} />
          )}

          {/* Filter chip — surfaces active state via filled background */}
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            className="h-8 px-3 rounded-full text-sm flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer"
            style={{
              background: filterActive ? 'var(--ink)' : 'var(--surface)',
              color: filterActive ? '#fff' : 'var(--ink-2)',
              border: filterActive ? 'none' : '1px solid var(--hairline)',
            }}
            aria-label={t.dashboard.filterAriaLabel}
          >
            {t.dashboard.filterLabel}
            {filterActive && (
              <span
                aria-hidden
                className="inline-block rounded-full shrink-0"
                style={{ width: 6, height: 6, background: 'var(--accent)' }}
              />
            )}
          </button>

          {/* Drill chip — surfaces the active stats-bar drill so the user has
              a one-tap way out. Only when there's an active drill for this tab. */}
          {effectiveDrill && (
            <DrillFilterChip
              drill={effectiveDrill}
              assetName={drillAssetName}
              onClear={handleClearDrill}
            />
          )}
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
          new one fetches its own page-1 cleanly via `key={tab}`. The drill
          and date-range keys participate so a change to either also
          triggers a clean remount (initial data is already SSR-scoped). */}
      <TransactionFeed
        key={`${tab}:${dateRangeKey}:${effectiveDrillKey}`}
        initial={tabInitial}
        pageSize={pageSize}
        monthKey={monthKeyForLoader}
        onItemClick={handleItemClick}
        filter={tab !== 'income' ? feedFilterProp : undefined}
        loader={tabLoader}
        renderRow={tab !== 'income' ? renderRow : undefined}
        emptyState={
          tab === 'income'
            ? <IncomeEmptyState />
            : (
              <div className="px-6 py-16 text-center text-sm" style={{ color: 'var(--ink-3)' }}>
                {filterActive || effectiveDrill ? t.feed.noFiltered : t.feed.noFilteredAddHint}
              </div>
            )
        }
      />

      <BottomNav
        onAddClick={() => tab === 'income' ? setAddingIncomeNew(true) : setAdding(true)}
        hideFab={sheetOpen || isPast}
      />

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
        currentFilter={filter}
        currentDateRange={dateRange}
        defaultMonthKey={maxMonthKey}
        assets={assets}
        onClose={() => setFilterOpen(false)}
        onApply={handleApplyFilter}
        onReset={() => handleApplyFilter(defaultFilter(), { kind: 'month', monthKey: maxMonthKey })}
        onShare={(draft, draftRange) => buildShareUrl(draft, draftRange)}
      />
      <IncomeSheet
        open={editingIncome !== null || addingIncomeNew}
        onClose={handleSheetClose}
        initial={editingIncome ?? undefined}
        onMutated={handleMutated}
      />

      {/* NewFuelLog is mounted lazily because its `car` prop is required and
          only known after the user taps a fuel-log row. Keep this conditional
          last so the slot order above (sheets) stays stable. */}
      {fuel.car !== null ? (
        <NewFuelLog
          open={fuel.open}
          onClose={fuel.close}
          car={fuel.car}
          lastOdometer={null}  // not available from records list context
          mode="edit"
          initial={fuel.initial}
        />
      ) : null}
    </div>
  )
}
