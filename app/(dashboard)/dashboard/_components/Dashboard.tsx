'use client'

import { Suspense, use, useCallback, useEffect, useMemo, useReducer, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BrandHeader } from './BrandHeader'
import { ModeTogglePlaceholder } from './ModeTogglePlaceholder'
import { ContextStrip } from '@/app/(dashboard)/_components/ContextStrip'
import { SoloBanner } from './SoloBanner'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { useRealtimeEvents } from '@/app/(dashboard)/_components/RealtimeProvider'
import { BalanceHero } from './BalanceHero'
import { AddSheet, type AddSheetInitial } from './AddSheet'
import { SettlementSheet, type SettlementSheetInitial } from './SettlementSheet'
import { IncomeSheet, type IncomeSheetInitial } from './IncomeSheet'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import { TransactionFeed } from '@/app/(dashboard)/_components/TransactionFeed'
import { EmptyState } from './EmptyState'
import { IncomeEmptyState } from './IncomeEmptyState'
import { defaultFilter, toWire, type TxnFilter, type PayerFilter, type SplitFilter } from '@/lib/filter'
import type { PagedTxnRow } from '@/actions/transaction'
import { makeIncomeLoader } from '@/lib/incomeFeedRow'
import { CompactRow } from './CompactRow'
import { DEFAULT_INCOME_PALETTE } from '@/lib/incomePalettes'
import { NewFuelLog, type NewFuelLogInitial } from '@/app/(dashboard)/assets/[id]/_components/NewFuelLog'
import { getFuelLogById } from '@/actions/fuelLog'
import type { FuelType } from '@/lib/fuel'
import { PendingIncomeStack } from './PendingIncomeStack'
import { PendingExpenseStack } from './PendingExpenseStack'
import { FirstRecordCard } from './FirstRecordCard'
import type { PendingRow } from '@/lib/db/queries/recurringIncome'
import type { PendingExpenseRow } from '@/lib/db/queries/recurringExpense'
import { useTranslations } from '@/lib/i18n/client'
import type { CurrencyCode } from '@/lib/currency'
import type { TripOption } from './TripSelector'
import type { RateEntry } from './AddSheet'

const SOLO_BANNER_DISMISS_KEY = 'oikos_solo_banner_dismissed'

/** Info every sheet hands back through onMutated so Dashboard can drive a
 *  success toast + the first-record card without each sheet owning its own
 *  toast state. `savedAmount` is the integer TWD value just written;
 *  `edit` distinguishes "updated" vs "recorded" copy; `deleted` overrides
 *  both with a flat acknowledgement. */
export type MutatedInfo = {
  isFirstTransaction?: boolean
  savedAmount?: number
  edit?: boolean
  deleted?: boolean
}

type ModalState =
  | { kind: 'closed' }
  | { kind: 'add' }
  | { kind: 'income' }
  | { kind: 'edit-income'; data: IncomeSheetInitial }
  | { kind: 'edit-pending'; pendingId: string; data: IncomeSheetInitial }
  | { kind: 'edit-pending-expense'; pendingId: string; data: AddSheetInitial }
  | { kind: 'edit-tx'; data: AddSheetInitial }
  | { kind: 'edit-settlement'; data: SettlementSheetInitial }

export interface DashboardFeedData {
  recent: PagedTxnRow[]
  recentIncomeFeed: PagedTxnRow[]
}

export interface DashboardProps {
  balance: number
  /** Delta to add to `balance` for the include-pending view (issue #164). */
  pendingBalanceDelta: number
  pageSize: number
  incomeMonthTotal: number
  incomeMonthCount: number
  recentIncomeLabel: string | null
  pendings: PendingRow[]
  expensePendings: PendingExpenseRow[]
  feedDataPromise: Promise<DashboardFeedData>
  groupDefaultRatioA: number | null
  /** Group's base currency (default 'twd'). */
  baseCurrency?: CurrencyCode
  /** Active trips in the current epoch. */
  activeTrips?: TripOption[]
  /** Exchange rates for this group. */
  rates?: RateEntry[]
}

export function Dashboard({
  balance,
  pendingBalanceDelta,
  pageSize,
  incomeMonthTotal,
  incomeMonthCount,
  recentIncomeLabel,
  pendings,
  expensePendings,
  feedDataPromise,
  groupDefaultRatioA,
  baseCurrency = 'twd',
  activeTrips = [],
  rates = [],
}: DashboardProps) {
  const router = useRouter()
  const { isSolo, isPast, viewerIsA, partner } = useMember()
  const t = useTranslations()

  useRealtimeEvents((event) => {
    if (
      event.kind === 'group-updated' ||
      event.kind === 'reconnect' ||
      event.kind === 'income-insert' ||
      event.kind === 'income-update' ||
      event.kind === 'recurring-income-changed' ||
      event.kind === 'pending-occurrence-changed' ||
      event.kind === 'recurring-expense-changed' ||
      event.kind === 'pending-expense-occurrence-changed'
    ) {
      // Partner accepted the invite (group-updated), or we reconnected after a
      // disconnect that may have missed the event. Re-fetch the layout to get
      // fresh MemberContext (partner profile + isSolo flips to false).
      // Income insert/update: refresh to re-fetch income month summary and hero card data.
      router.refresh()
    }
  })

  const [mode, setMode] = useState<'expense' | 'income'>('expense')
  const [modal, dispatch] = useReducer((_prev: ModalState, next: ModalState) => next, { kind: 'closed' })

  // L3 filter state — two independent dimensions, both Dashboard-local
  // (no FilterSheet on this page; full filter is over on /records). Both
  // dimensions share the same dual-toggle UX: both sides selected = no
  // filter; only one side = narrow to that side. The split dim covers
  // `all_mine` / `all_theirs`; ratio-based modes (`half` + `weighted`)
  // are intentionally only visible when both sides are selected — the
  // user said this matches how they read those records.
  type DashboardPayer = 'all' | 'me' | 'partner'
  type DashboardSplit = 'all' | 'mine' | 'theirs'
  const [payerFilter, setPayerFilter] = useState<DashboardPayer>('all')
  const [splitFilter, setSplitFilter] = useState<DashboardSplit>('all')

  // Fuel log edit sheet state
  const [fuelSheetOpen, setFuelSheetOpen] = useState(false)
  const [fuelSheetInitial, setFuelSheetInitial] = useState<NewFuelLogInitial | null>(null)
  const [fuelCar, setFuelCar] = useState<{
    id: string; name: string; plate: string
    fuelType: FuelType | null
    primaryUserId: string | null
  } | null>(null)
  const [, startFuelLoad] = useTransition()

  // First-record theory card visibility (#43 phase C). Lit by AddSheet's
  // onMutated when createTransaction reports isFirstTransaction=true; persists
  // across the router.refresh() that the same callback triggers because
  // refresh re-runs the server tree without unmounting client state.
  const [showFirstCard, setShowFirstCard] = useState(false)

  // Lightweight transient toast — surfaced both for partner-race notices and
  // for every successful create / edit / delete via handleMutated.
  const [toast, setToast] = useState<string | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showToast = (msg: string, durationMs = 2500) => {
    setToast(msg)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), durationMs)
  }
  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current) }, [])

  // SoloBanner dismissal — persisted in localStorage, hydrated on mount.
  // SSR renders the banner; on first client paint we may swap to the fallback hero.
  const [bannerDismissed, setBannerDismissed] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    setBannerDismissed(window.localStorage.getItem(SOLO_BANNER_DISMISS_KEY) === 'true')
  }, [])
  const handleDismissBanner = () => {
    window.localStorage.setItem(SOLO_BANNER_DISMISS_KEY, 'true')
    setBannerDismissed(true)
  }

  const sheetOpen = modal.kind !== 'closed'

  // Compose L3 toggles into a TxnFilter for the feed. Both dims are
  // optional; when both are 'all' we pass null so TransactionFeed skips
  // its filter branch entirely (no realtime mismatch, no wire roundtrip).
  // Split toggles use the `mine_cost` / `theirs_cost` aggregates so a
  // single-sided pick still includes records where that side bears cost
  // through a ratio split (half / weighted) — see `SplitFilter` docs.
  const effectiveFilter = useMemo<TxnFilter | null>(() => {
    const payer: PayerFilter =
      payerFilter === 'me' ? 'mine' : payerFilter === 'partner' ? 'theirs' : 'all'
    const split: SplitFilter =
      splitFilter === 'mine'
        ? 'mine_cost'
        : splitFilter === 'theirs'
          ? 'theirs_cost'
          : 'all'
    if (payer === 'all' && split === 'all') return null
    return { ...defaultFilter(), payer, split }
  }, [payerFilter, splitFilter])

  const handleItemClick = useCallback((tx: PagedTxnRow) => {
    // Past-epoch view is read-only — never open an edit sheet, even if a
    // child row missed the gate. Defence in depth on top of TransactionFeed
    // and the custom income renderRow already dropping their onClick.
    if (isPast) return
    if (tx.kind === 'income') {
      dispatch({
        kind: 'edit-income',
        data: {
          id: tx.id,
          amount: tx.amount,
          category: tx.category,
          source: tx.description || null,
          recipientId: tx.paidBy,
          assetId: tx.assetId,
          occurredAt: tx.transactedAt.substring(0, 10),
        },
      })
      return
    }

    if (tx.kind === 'settlement') {
      dispatch({
        kind: 'edit-settlement',
        data: {
          id: tx.id,
          amount: tx.amount,
          payerId: tx.paidBy,
          settledAt: tx.transactedAt,
        },
      })
      return
    }

    if (tx.fuelLogId !== null) {
      startFuelLoad(async () => {
        const detail = await getFuelLogById(tx.fuelLogId!)
        if (!detail) return
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

    dispatch({
      kind: 'edit-tx',
      data: {
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
      },
    })
  }, [startFuelLoad, isPast])

  const handleClose = () => dispatch({ kind: 'closed' })
  const settlementData = modal.kind === 'edit-settlement' ? modal.data : null

  const handleMutated = (info?: MutatedInfo) => {
    if (info?.isFirstTransaction) setShowFirstCard(true)
    if (info?.deleted) {
      showToast(t.common.toast.deleted, 1500)
    } else if (info?.savedAmount != null) {
      const tmpl = info.edit ? t.common.toast.updated : t.common.toast.recorded
      // TODO(v0.17 currency): toast template has `NT${amount}` baked in;
      // needs formatAmount digits-only mode or move the symbol into the format call.
      showToast(tmpl.replace('{amount}', info.savedAmount.toLocaleString('en-US')), 1500)
    }
    router.refresh()
  }

  const addOrIncome = mode === 'income' ? 'income' : 'add'

  return (
    <div className="relative min-h-dvh pb-[var(--bottom-nav-offset)]">
      {/* L1: Brand identity */}
      <BrandHeader showTripButton={activeTrips.length === 0} onTripClick={() => { /* no-op for now */ }} />
      {/* L3: Contextual strip (offline / past-epoch / partner-left / active-trip) */}
      <ContextStrip activeTrips={activeTrips} baseCurrency={baseCurrency} />
      {/* L2: Mode toggle — left-aligned */}
      <div className="px-5 pb-3">
        <ModeTogglePlaceholder
          mode={mode}
          onChange={setMode}
          incomePendingCount={pendings.length}
          expensePendingCount={expensePendings.length}
        />
      </div>
      {/* L3 filter row — two avatar-coloured dual-toggle pills:
          payer (誰付) + split (誰負擔). Both share the same visual /
          interaction. Solo mode has nothing useful in either dim
          (only one person, no real split decisions), so the whole row
          collapses. */}
      {!isSolo && partner && (
        <div
          className="flex items-center gap-2 px-5 pb-2 overflow-x-auto"
          style={{ scrollbarWidth: 'none' } as React.CSSProperties}
        >
          <PayerDualToggle
            value={payerFilter}
            onChange={setPayerFilter}
            viewerIsA={viewerIsA}
            t={t}
          />
          <SplitDualToggle
            value={splitFilter}
            onChange={setSplitFilter}
            viewerIsA={viewerIsA}
            t={t}
          />
        </div>
      )}
      {isSolo ? (
        bannerDismissed ? (
          <div className="px-5 pt-3 pb-5">
            <div className="text-xs flex items-center justify-between" style={{ color: 'var(--ink-3)' }}>
              <span>{t.dashboard.soloHint}</span>
              <Link href="/settings" className="underline" style={{ color: 'var(--ink-2)' }}>
                {t.dashboard.inviteCta}
              </Link>
            </div>
          </div>
        ) : (
          <SoloBanner
            onDismiss={handleDismissBanner}
            incomePendingCount={pendings.length}
            expensePendingCount={expensePendings.length}
            mode={mode}
            onModeChange={setMode}
          />
        )
      ) : (
        <BalanceHero
          rawBalance={balance}
          pendingBalanceDelta={pendingBalanceDelta}
          onSettleMutated={handleMutated}
          mode={mode}
          onModeChange={setMode}
          incomeMonthTotal={incomeMonthTotal}
          incomeMonthCount={incomeMonthCount}
          recentIncomeLabel={recentIncomeLabel}
        />
      )}
      {mode === 'expense' && expensePendings.length > 0 && (
        <div className="px-5">
          <PendingExpenseStack
            pendings={expensePendings}
            onEdit={(p) => dispatch({
              kind: 'edit-pending-expense',
              pendingId: p.id,
              data: {
                id: p.id,
                amount: p.proposedAmount,
                description: p.proposedDescription,
                category: p.category,
                splitType: p.proposedSplitType,
                splitRatioA: (p as { proposedSplitRatioA?: number | null }).proposedSplitRatioA ?? null,
                payerId: p.proposedPaidBy,
                // Construct as local midnight so AddSheet's getFullYear/Month/Date
                // round-trip yields the original YYYY-MM-DD regardless of timezone.
                transactedAt: `${p.proposedDate}T00:00:00`,
                assetId: p.assetId,
                notes: null,
              },
            })}
          />
        </div>
      )}
      {mode === 'income' && (
        <div className="px-5">
          <PendingIncomeStack
            pendings={pendings}
            onEdit={(p) => dispatch({
              kind: 'edit-pending',
              pendingId: p.id,
              data: {
                id: p.id,
                amount: p.proposedAmount,
                category: p.category,
                source: p.source,
                recipientId: p.recipientId,
                assetId: p.assetId,
                occurredAt: p.proposedDate,
              },
            })}
          />
        </div>
      )}
      <Suspense fallback={<DashboardFeedSkeleton />}>
        <DashboardFeed
          feedDataPromise={feedDataPromise}
          mode={mode}
          pageSize={pageSize}
          filter={effectiveFilter}
          onItemClick={handleItemClick}
          onAddIncome={() => dispatch({ kind: 'income' })}
          onAddTx={() => dispatch({ kind: 'add' })}
        />
      </Suspense>
      <BottomNav onAddClick={() => dispatch({ kind: addOrIncome })} hideFab={sheetOpen || isPast} />
      <AddSheet
        open={modal.kind === 'add' || modal.kind === 'edit-tx' || modal.kind === 'edit-pending-expense'}
        onClose={handleClose}
        initial={
          modal.kind === 'edit-tx' ? modal.data
            : modal.kind === 'edit-pending-expense' ? modal.data
            : undefined
        }
        pendingExpenseId={modal.kind === 'edit-pending-expense' ? modal.pendingId : undefined}
        onMutated={handleMutated}
        onRaceResolved={showToast}
        groupDefaultRatioA={groupDefaultRatioA}
        baseCurrency={baseCurrency}
        activeTrips={activeTrips}
        rates={rates}
      />
      <SettlementSheet
        open={settlementData !== null}
        onClose={handleClose}
        initial={settlementData}
        onMutated={handleMutated}
      />
      <IncomeSheet
        open={modal.kind === 'income' || modal.kind === 'edit-income' || modal.kind === 'edit-pending'}
        onClose={handleClose}
        initial={
          modal.kind === 'edit-income' ? modal.data
            : modal.kind === 'edit-pending' ? modal.data
            : undefined
        }
        mode={modal.kind === 'edit-pending' ? 'edit-pending' : undefined}
        pendingId={modal.kind === 'edit-pending' ? modal.pendingId : undefined}
        onMutated={handleMutated}
        onRaceResolved={showToast}
      />
      {fuelCar && (
        <NewFuelLog
          open={fuelSheetOpen}
          onClose={() => setFuelSheetOpen(false)}
          car={fuelCar}
          lastOdometer={null}
          mode="edit"
          initial={fuelSheetInitial}
        />
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed left-1/2 top-4 z-[120] -translate-x-1/2 w-[calc(100%-32px)] max-w-[calc(28rem-32px)] px-4 py-3 rounded-xl text-sm text-white text-center"
          style={{ background: 'var(--ink)' }}
        >
          {toast}
        </div>
      )}

      <FirstRecordCard
        show={showFirstCard}
        onDismiss={() => setShowFirstCard(false)}
      />
    </div>
  )
}

interface DashboardFeedProps {
  feedDataPromise: Promise<DashboardFeedData>
  mode: 'expense' | 'income'
  pageSize: number
  filter: TxnFilter | null
  onItemClick: (tx: PagedTxnRow) => void
  onAddIncome: () => void
  onAddTx: () => void
}

function DashboardFeed({
  feedDataPromise,
  mode,
  pageSize,
  filter,
  onItemClick,
  onAddIncome,
  onAddTx,
}: DashboardFeedProps) {
  const { recent, recentIncomeFeed } = use(feedDataPromise)
  const P = DEFAULT_INCOME_PALETTE
  const t = useTranslations()

  const incomeRenderRow = useCallback((tx: PagedTxnRow): React.ReactNode | undefined => {
    if (tx.kind !== 'income') return undefined
    return (
      <div style={{ background: `linear-gradient(90deg, ${P.glow}55, transparent 60%)` }}>
        <CompactRow tx={tx} isLast={false} onClick={() => onItemClick(tx)} />
      </div>
    )
  }, [onItemClick, P.glow])

  // Income loader closes over the active filter so the income feed responds
  // to L3 chip changes the same way the cash feed does — TransactionFeed
  // calls loader(null) on filter-prop change. Recreated each filter ref
  // change; stable while filter is null.
  const incomeLoader = useMemo(
    () => makeIncomeLoader(20, undefined, undefined, filter ? toWire(filter) : undefined),
    [filter],
  )

  return (
    <TransactionFeed
      key={mode}
      initial={mode === 'income' ? recentIncomeFeed : recent}
      pageSize={pageSize}
      onItemClick={onItemClick}
      filter={filter ?? undefined}
      loader={mode === 'income' ? incomeLoader : undefined}
      renderRow={mode === 'income' ? incomeRenderRow : undefined}
      label={
        <div className="flex items-end justify-between">
          <span className="text-xs font-medium tracking-[0.5px]" style={{ color: 'var(--ink-2)' }}>
            {t.feed.header}
          </span>
        </div>
      }
      emptyState={
        mode === 'income'
          ? <IncomeEmptyState onAdd={onAddIncome} />
          : <EmptyState onAdd={onAddTx} />
      }
    />
  )
}

function DashboardFeedSkeleton() {
  const t = useTranslations()
  return (
    <>
      <div className="px-6 pt-2 pb-1">
        <span className="text-xs font-medium tracking-[0.5px]" style={{ color: 'var(--ink-2)' }}>
          {t.feed.header}
        </span>
      </div>
      <div className="px-6 pt-4 pb-2">
        <div className="h-4 w-24 rounded animate-pulse" style={{ background: 'var(--surface)', opacity: 0.6 }} />
      </div>
      <div
        className="mx-4 rounded-[18px] overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-[68px] animate-pulse"
            style={{
              background: 'var(--surface)',
              opacity: 0.6,
              borderTop: i === 0 ? 'none' : '1px solid var(--hairline)',
            }}
          />
        ))}
      </div>
    </>
  )
}

type Side = 'left' | 'right'

interface MemberDualToggleProps {
  /** Selection state. Must be non-empty — component enforces ≥1. `left`
   *  = viewer's side (avatar-coloured by viewer role), `right` = partner's
   *  side (the opposite role's avatar colour). */
  selected: Set<Side>
  onChange: (next: Set<Side>) => void
  /** Same source of truth as `<Avatar memberRole=…/>` — drives which side
   *  gets `var(--ink)` (role 'a') vs `var(--accent)` (role 'b'). */
  viewerIsA: boolean
  leftLabel: string
  rightLabel: string
}

/**
 * Two-pill toggle keyed by member side. Used by both the payer (誰付)
 * and split (誰負擔) L3 dimensions — they have the same shape: two
 * member-coloured pills, both-selected = no filter, single-selected
 * narrows to that member, zero-selected is disallowed. Selected fill
 * matches the avatar colour so the chip and the avatar above the page
 * header read as the same person at a glance.
 */
function MemberDualToggle({
  selected,
  onChange,
  viewerIsA,
  leftLabel,
  rightLabel,
}: MemberDualToggleProps) {
  const toggle = (side: Side) => {
    const next = new Set(selected)
    if (next.has(side)) {
      if (next.size === 1) return
      next.delete(side)
    } else {
      next.add(side)
    }
    onChange(next)
  }
  const viewerColor = viewerIsA ? 'var(--ink)' : 'var(--accent)'
  const partnerColor = viewerIsA ? 'var(--accent)' : 'var(--ink)'
  return (
    <div
      className="inline-flex items-center shrink-0"
      style={{
        background: 'var(--surface)',
        border: '0.5px solid var(--hairline)',
        borderRadius: 999,
        padding: 2,
        gap: 2,
      }}
    >
      {([
        { side: 'left' as Side, label: leftLabel, color: viewerColor },
        { side: 'right' as Side, label: rightLabel, color: partnerColor },
      ]).map(({ side, label, color }) => {
        const sel = selected.has(side)
        return (
          <button
            key={side}
            type="button"
            onClick={() => toggle(side)}
            className="inline-flex items-center cursor-pointer border-0 text-xs font-medium transition-colors duration-150"
            style={{
              height: 22,
              padding: '0 10px',
              borderRadius: 999,
              background: sel ? color : 'transparent',
              color: sel ? '#fff' : 'var(--ink-3)',
            }}
            aria-pressed={sel}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

interface PayerDualToggleProps {
  value: 'all' | 'me' | 'partner'
  onChange: (next: 'all' | 'me' | 'partner') => void
  viewerIsA: boolean
  t: ReturnType<typeof useTranslations>
}

function PayerDualToggle({ value, onChange, viewerIsA, t }: PayerDualToggleProps) {
  const selected: Set<Side> =
    value === 'all'
      ? new Set<Side>(['left', 'right'])
      : new Set<Side>([value === 'me' ? 'left' : 'right'])
  const handleChange = (next: Set<Side>) => {
    onChange(
      next.size === 2 ? 'all' : next.has('left') ? 'me' : 'partner',
    )
  }
  return (
    <MemberDualToggle
      selected={selected}
      onChange={handleChange}
      viewerIsA={viewerIsA}
      leftLabel={t.dashboard.payerMe}
      rightLabel={t.dashboard.payerPartner}
    />
  )
}

interface SplitDualToggleProps {
  value: 'all' | 'mine' | 'theirs'
  onChange: (next: 'all' | 'mine' | 'theirs') => void
  viewerIsA: boolean
  t: ReturnType<typeof useTranslations>
}

/**
 * Split-type dual-toggle. 「我負擔」+「對方負擔」collapse to `'all'`
 * when both selected (the feed then shows ratio-based half / weighted
 * records too — those modes are intentionally NOT pickable on their
 * own from L3; only visible when the dim is unfiltered).
 */
function SplitDualToggle({ value, onChange, viewerIsA, t }: SplitDualToggleProps) {
  const selected: Set<Side> =
    value === 'all'
      ? new Set<Side>(['left', 'right'])
      : new Set<Side>([value === 'mine' ? 'left' : 'right'])
  const handleChange = (next: Set<Side>) => {
    onChange(
      next.size === 2 ? 'all' : next.has('left') ? 'mine' : 'theirs',
    )
  }
  return (
    <MemberDualToggle
      selected={selected}
      onChange={handleChange}
      viewerIsA={viewerIsA}
      leftLabel={t.dashboard.splitFilter.mine}
      rightLabel={t.dashboard.splitFilter.theirs}
    />
  )
}
