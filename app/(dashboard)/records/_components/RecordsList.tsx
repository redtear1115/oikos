'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { AddSheetInitial } from '@/app/(dashboard)/dashboard/_components/AddSheet'
import type { SettlementSheetInitial } from '@/app/(dashboard)/dashboard/_components/SettlementSheet'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import { TransactionFeed } from '@/app/(dashboard)/_components/TransactionFeed'
import { useRealtimeEvents } from '@/app/(dashboard)/_components/RealtimeProvider'
import { renderIncomeFeedRow } from '@/app/(dashboard)/dashboard/_components/IncomeFeedRow'
import Link from 'next/link'
import type { AssetOption } from './FilterSheet'
import { MonthSwitcher } from './MonthSwitcher'
import { DateRangeChip } from './DateRangeChip'
import { TabProvider, type RecordsTab } from './TabContext'
import {
  applyDateRangeToParams,
  applyFilterToParams,
  defaultFilter,
  filterKey,
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
import { loadMoreFeedAll, loadMoreTransactions, loadRecordsMonthSummaries } from '@/actions/transaction'
import type { FeedMonthSummary } from '@/lib/db/queries/feedMonthSummary'
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
import { runAfterSheetCloseBack } from '@/lib/sheetNavigation'

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
  /**
   * SSR per-month aggregates for the 全部 tab, computed server-side with the
   * exact same params as `initial` (see page.tsx). Used as the initial value
   * for the client-owned `summaries` state and re-synced whenever this prop
   * changes (e.g. after a `router.refresh()`); the 支出/收入 tabs (client-only
   * L2 toggle) always fetch their own via `loadRecordsMonthSummaries` (#1208).
   */
  monthSummaries: FeedMonthSummary[]
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
  monthSummaries,
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
  // Memoized (not a plain `? toDrillWire(effectiveDrill) : undefined`) so it
  // only changes reference when `effectiveDrill` itself does. It's a
  // dependency of the summaries-sync effect below; a fresh wire object on
  // every render — even when nothing actually changed — would retrigger that
  // effect every render and loop (#1208 caught this via the RecordsList
  // filter-remount test OOMing, not via any visible symptom in the browser).
  const effectiveDrillWire = useMemo(
    () => (effectiveDrill ? toDrillWire(effectiveDrill) : undefined),
    [effectiveDrill],
  )

  // Structured filter — also URL-derived. Server SSR already applied it; the
  // client mirrors via useSearchParams so the FilterSheet's "current state"
  // and the loaders / realtime row predicate share one source of truth.
  const filter = useMemo<TxnFilter>(() => parseFilterFromSearchParams(searchParams), [searchParams])
  const filterActive = isFilterActive(filter)
  // Same reference-stability reasoning as `effectiveDrillWire` above.
  const filterWire = useMemo(
    () => (filterActive ? toWire(filter) : undefined),
    [filterActive, filter],
  )
  // For TransactionFeed.filter — only pass when active so the empty-state
  // logic in TransactionFeed correctly distinguishes "no filter" from
  // "filter that excluded everything".
  const feedFilterProp = filterActive ? filter : undefined
  // dateRange travels through to the loaders. SSR already used it for the
  // initial page; the loaders need it for pagination.
  const dateRangeForLoader = dateRange.kind === 'month' ? undefined : dateRange
  const monthKeyForLoader = dateRange.kind === 'month' ? monthKey : undefined

  // Date-range key — used in the feed key (and the summaries key below) so a
  // date-range change triggers a clean remount the same way drill changes do.
  const dateRangeKey = dateRange.kind === 'month'
    ? `m:${dateRange.monthKey}`
    : dateRange.kind === 'range'
      ? `r:${dateRange.start}:${dateRange.end}`
      : 'all'
  // Same identity as TransactionFeed's `key` prop below — the summaries state
  // is keyed by it too so a tab/drill/filter/date-range change and a feed
  // remount always happen together (#1208).
  const feedKey = `${tab}:${dateRangeKey}:${effectiveDrillKey}:${filterKey(filter)}`

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

  // Per-month feed-header summaries (#1208). SSR only computes them for the
  // 全部 tab (`monthSummaries` prop, same params as `initial`); every other
  // key — a different tab, or a drill/filter/date-range change the SSR prop
  // hasn't caught up to yet — fetches its own via `loadRecordsMonthSummaries`.
  // Kept as `{ key, data }` rather than bare `data` so a fetch that resolves
  // after the key has since changed again can recognize itself as stale and
  // no-op instead of clobbering newer state.
  const [summaries, setSummaries] = useState<{ key: string; data: FeedMonthSummary[] }>(
    () => ({ key: feedKey, data: monthSummaries }),
  )
  // When the SSR `monthSummaries` prop may be trusted as-is. It describes the
  // 全部 view as of the moment it arrived — and only until the view moves off
  // that key. After a tab / drill / filter change, realtime refetches can have
  // superseded it, and a same-reference prop says nothing new; coming back to
  // 全部 must refetch instead of restoring it. Symptom if this is dropped:
  // switching 支出 → 全部 shows the numbers from page load, not the ones
  // realtime had corrected since.
  const ssrPropRef = useRef(monthSummaries)
  const ssrKeyRef = useRef(feedKey)
  const ssrSupersededRef = useRef(false)
  // Mirrors `feedKey` into a ref so the debounced realtime refetch below
  // (scheduled from one render, resolving on a later one) can tell whether
  // it's still the current view by the time its response comes back.
  const feedKeyRef = useRef(feedKey)
  useEffect(() => { feedKeyRef.current = feedKey }, [feedKey])

  useEffect(() => {
    if (monthSummaries !== ssrPropRef.current) {
      // Fresh SSR payload (navigation or `router.refresh()`), computed for the
      // URL the view is on right now.
      ssrPropRef.current = monthSummaries
      ssrKeyRef.current = feedKey
      ssrSupersededRef.current = false
    } else if (feedKey !== ssrKeyRef.current) {
      ssrSupersededRef.current = true
    }
    // 全部 tab with the URL-derived drill/filter/range IS the SSR key —
    // `drillAppliesToTab(drill, 'all')` is always true (see lib/drill.ts),
    // so `effectiveDrillKey` on this tab always equals the raw URL drill's
    // key, which is exactly what `feedKey` reduces to here. No fetch needed
    // while the prop still describes this exact view.
    if (tab === 'all' && !ssrSupersededRef.current) {
      setSummaries({ key: feedKey, data: monthSummaries })
      return
    }
    let stale = false
    loadRecordsMonthSummaries(tab, monthKeyForLoader, effectiveDrillWire, filterWire, dateRangeForLoader)
      .then((fresh) => {
        if (stale) return
        setSummaries({ key: feedKey, data: fresh })
      })
      .catch(() => {
        // Keep previous summaries silently — a stale header beats a broken one.
      })
    return () => { stale = true }
  }, [tab, feedKey, monthSummaries, monthKeyForLoader, effectiveDrillWire, filterWire, dateRangeForLoader])

  // Debounced (~300ms) refetch on any realtime event that could change a
  // month's count/sum, so headers self-correct without depending on the
  // TransactionFeed row-level realtime handling (which only patches the
  // items list, not these server-aggregated totals).
  const summaryDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (summaryDebounceRef.current) clearTimeout(summaryDebounceRef.current)
  }, [])

  useRealtimeEvents((event) => {
    if (event.kind === 'income-insert' || event.kind === 'income-update') {
      router.refresh()
    }
    const affectsSummaries =
      event.kind === 'txn-insert' || event.kind === 'txn-update' ||
      event.kind === 'settle-insert' || event.kind === 'settle-update' ||
      event.kind === 'income-insert' || event.kind === 'income-update' ||
      event.kind === 'reconnect'
    if (!affectsSummaries) return

    if (summaryDebounceRef.current) clearTimeout(summaryDebounceRef.current)
    const scheduledKey = feedKey
    const scheduledTab = tab
    const scheduledMonthKey = monthKeyForLoader
    const scheduledDrillWire = effectiveDrillWire
    const scheduledFilterWire = filterWire
    const scheduledDateRange = dateRangeForLoader
    summaryDebounceRef.current = setTimeout(() => {
      loadRecordsMonthSummaries(scheduledTab, scheduledMonthKey, scheduledDrillWire, scheduledFilterWire, scheduledDateRange)
        .then((fresh) => {
          // Stale — the view changed since this refetch was scheduled.
          if (feedKeyRef.current !== scheduledKey) return
          setSummaries({ key: scheduledKey, data: fresh })
        })
        .catch(() => {
          // Keep previous summaries silently.
        })
    }, 300)
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
  const renderRow = (tx: PagedTxnRow) => renderIncomeFeedRow(tx, handleItemClick)

  const handleApplyFilter = (next: TxnFilter, nextRange?: DateRange) => {
    const params = new URLSearchParams(searchParams.toString())
    applyFilterToParams(params, next)
    // /records always passes a concrete dateRange — the optional `?` here is
    // only because FilterSheet supports a lite mode for /dashboard.
    if (nextRange) applyDateRangeToParams(params, nextRange)
    const qs = params.toString()
    const target = `/records${qs ? `?${qs}` : ''}`

    // Closing the FilterSheet runs the backdrop's synthetic-history unwind
    // (window.history.back(), see useEscapeToClose). Done in the same tick as
    // router.replace, that back lands *after* the replace and reverts it — the
    // new ?fPayer never sticks and the filter silently fails to apply (#745 /
    // #752 were both misdiagnoses of this). Defer the navigation until the
    // synthetic-back's popstate has landed so the replace survives.
    runAfterSheetCloseBack(() => router.replace(target, { scroll: false }))
    setFilterOpen(false)
  }

  return (
    <div className="relative min-h-dvh pb-[var(--bottom-nav-offset)]">
      {/* Sticky header — pins below the shell top stack rather than at the very
          top of the viewport (#1037). The stack is itself sticky, so it is the
          permanent topmost element whenever it holds anything; `--top-stack-h`
          is its measured height and 0px when it is empty, which is exactly the
          old `top-0`. */}
      <div
        className="sticky top-[var(--top-stack-h)] z-20"
        style={{ background: 'var(--bg)' }}
      >
        {/* L1Header — unified across Dashboard / Records / Assets (#545 §1).
            pb-3 matches Assets L1 — keeps the title's breathing room while
            tightening the row a notch vs the earlier pb-4.

            Reads --safe-top like every other header. Until #1037 it had to call
            env() itself, because once it pinned, the shell strip above it had
            scrolled away and this row was topmost again — at the cost of ~23px
            of extra gap while scrolled to the top. Now the strip never scrolls
            away, so "is there a band above me" is a static question again and
            --safe-top already answers it. */}
        <div className="px-5 pt-[max(var(--safe-top),24px)] pb-3 flex items-center justify-between">
          <h1
            className="text-2xl font-medium tracking-tight"
            style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}
          >
            {t.records.title}
          </h1>
          {/* Recurring entry — moved from the inline section card (#545 §4)
              to keep L3 focused on time/filter chips. */}
          <Link
            href="/settings/recurring"
            className="text-sm no-underline flex items-center gap-1 cursor-pointer"
            style={{ color: 'var(--ink-2)' }}
          >
            {t.records.recurringShortcut}
            <span aria-hidden className="text-sm leading-none">›</span>
          </Link>
        </div>

        {/* L2: dual toggle pill — 支出 + 收入 wrapped in one pill (#545 §3).
            Both selected = 全部 (no separate "all" pill). Disallow zero-
            selected — see toggleKind for why. */}
        <div className="px-5 pb-3">
          <div
            className="inline-flex items-center rounded-full p-0.75 gap-0.5"
            style={{
              background: 'var(--surface)',
              border: '0.5px solid var(--hairline)',
            }}
          >
            {/* Dot colours, rendered values unchanged: the expense dot sits on
                the ink fill, so it is the on-fill foreground at 55% (was a raw
                rgba white); the income dot is the mint palette ink at 70%. */}
            {([
              { kind: 'expense' as const, label: t.records.tabExpense, dotColor: 'var(--on-fill)', dotOpacity: 'opacity-55' },
              { kind: 'income' as const, label: t.records.tabIncome, dotColor: P.ink, dotOpacity: 'opacity-70' },
            ]).map(({ kind, label, dotColor, dotOpacity }) => {
              const sel = selectedKinds.has(kind)
              const isIncome = kind === 'income'
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => toggleKind(kind)}
                  className="h-8 px-3.5 rounded-full inline-flex items-center gap-1.5 cursor-pointer border-0 text-sm transition-colors duration-150"
                  style={{
                    background: sel ? (isIncome ? P.tint : 'var(--ink)') : 'transparent',
                    color: sel ? (isIncome ? P.ink : 'var(--on-fill)') : 'var(--ink-3)',
                    fontWeight: sel ? 600 : 500,
                  }}
                  aria-pressed={sel}
                >
                  {sel && (
                    <span
                      aria-hidden
                      className={`size-1.5 rounded-full shrink-0 ${dotOpacity}`}
                      style={{ background: dotColor }}
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
            L2 = what type of record, L3 = what time / filter / drill scope.

            `pt-1.5 -mt-1.5` is layout-neutral on purpose: `overflow-x-auto`
            also clips overflow-y, and clipping applies to hit-testing. The h-8
            chips extend their tap areas to 44px with ::before pseudos that
            reach 6px above the chip; with no top padding that strip was cut
            off and the real tap area stopped at ~38px. (#1169) */}
        <div
          className="flex items-center gap-2 px-5 pt-1.5 -mt-1.5 pb-3 overflow-x-auto"
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
              color: filterActive ? 'var(--on-fill)' : 'var(--ink-2)',
              border: filterActive ? 'none' : '1px solid var(--hairline)',
            }}
            aria-label={t.dashboard.filterAriaLabel}
          >
            {t.dashboard.filterLabel}
            {filterActive && (
              <span
                aria-hidden
                className="inline-block size-1.5 rounded-full shrink-0"
                style={{ background: 'var(--accent)' }}
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
          new one fetches its own page-1 cleanly via `key={tab}`. The drill,
          date-range AND structured-filter keys participate so a change to any
          of them triggers a clean remount onto the already-SSR-scoped
          `initial` — without the filter key, switching e.g.「我付的」would leave
          the stale instance, whose items only update via the client refetch,
          out of sync with the filtered SSR rows (#745). */}
      <TransactionFeed
        key={feedKey}
        initial={tabInitial}
        pageSize={pageSize}
        monthKey={monthKeyForLoader}
        onItemClick={handleItemClick}
        filter={tab !== 'income' ? feedFilterProp : undefined}
        loader={tabLoader}
        renderRow={tab !== 'income' ? renderRow : undefined}
        monthSummaries={{
          mode: tab,
          // Only summaries fetched for THIS view. While a new key's fetch is in
          // flight — or after it failed (offline) — the previous key's numbers
          // would otherwise sit on this tab's headers; an empty map makes each
          // month fall back to the loaded-rows sum instead.
          byMonth: summaries.key === feedKey
            ? Object.fromEntries(summaries.data.map((s) => [s.monthKey, s]))
            : {},
        }}
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
