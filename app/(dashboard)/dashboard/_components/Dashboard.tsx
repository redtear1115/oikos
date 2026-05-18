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
import { FilterSheet } from '@/app/(dashboard)/records/_components/FilterSheet'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import { TransactionFeed } from '@/app/(dashboard)/_components/TransactionFeed'
import { EmptyState } from './EmptyState'
import { IncomeEmptyState } from './IncomeEmptyState'
import { defaultFilter, isFilterActive, toWire, type TxnFilter, type PayerFilter } from '@/lib/filter'
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
import { useTranslations, useLocale } from '@/lib/i18n/client'
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
  | { kind: 'filter' }

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
  const { isSolo, isPast, partner } = useMember()
  const t = useTranslations()
  const locale = useLocale()

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
  const [filter, setFilter] = useState<TxnFilter | null>(null)

  // L3 payer filter state — driven by 3 inline chips on the L3 row (#545 §2).
  type DashboardPayer = 'all' | 'me' | 'partner'
  const [payerFilter, setPayerFilter] = useState<DashboardPayer>('all')

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

  // Merge L3 payer chip into the FilterSheet filter. 'me' → 'mine', 'partner' → 'theirs'.
  const effectiveFilter = useMemo<TxnFilter | null>(() => {
    const payer: PayerFilter = payerFilter === 'me' ? 'mine' : payerFilter === 'partner' ? 'theirs' : 'all'
    if (payer === 'all') return filter
    return { ...(filter ?? defaultFilter()), payer }
  }, [filter, payerFilter])

  const filterActive = effectiveFilter !== null && isFilterActive(effectiveFilter)

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
      {/* L3: month chip + 3 inline payer chips (#545 §2).
          Previously a single 篩選 chip opened a sheet — replaced with direct
          chips so payer selection is one tap, not two. */}
      <div className="flex items-center gap-2 px-5 pb-3 overflow-x-auto" style={{ scrollbarWidth: 'none' } as React.CSSProperties}>
        {/* Month chip — read-only, shows current Taipei month */}
        <div
          className="h-8 px-3 rounded-full text-sm flex items-center shrink-0"
          style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--ink-2)' }}
        >
          {new Date().toLocaleDateString(locale, { month: 'long' })}
        </div>
        {(
          [
            { key: 'all' as DashboardPayer, label: t.dashboard.payerAll },
            { key: 'me' as DashboardPayer, label: t.dashboard.payerMe },
            ...(!isSolo && partner ? [{ key: 'partner' as DashboardPayer, label: t.dashboard.payerPartner }] : []),
          ] as Array<{ key: DashboardPayer; label: string }>
        ).map(({ key, label }) => {
          const sel = payerFilter === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => setPayerFilter(key)}
              className="h-8 px-3 rounded-full text-sm flex items-center shrink-0 cursor-pointer transition-colors duration-150"
              style={{
                background: sel ? 'var(--ink)' : 'var(--surface)',
                color: sel ? '#fff' : 'var(--ink-2)',
                border: sel ? 'none' : '1px solid var(--hairline)',
              }}
              aria-pressed={sel}
            >
              {label}
            </button>
          )
        })}
      </div>
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
          filterActive={filterActive}
          onItemClick={handleItemClick}
          onFilterClick={() => dispatch({ kind: 'filter' })}
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
      <FilterSheet
        open={modal.kind === 'filter'}
        currentFilter={filter ?? defaultFilter()}
        onClose={() => dispatch({ kind: 'closed' })}
        onApply={(next) => {
          setFilter(isFilterActive(next) ? next : null)
          dispatch({ kind: 'closed' })
        }}
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
  filterActive: boolean
  onItemClick: (tx: PagedTxnRow) => void
  onFilterClick: () => void
  onAddIncome: () => void
  onAddTx: () => void
}

function DashboardFeed({
  feedDataPromise,
  mode,
  pageSize,
  filter,
  filterActive,
  onItemClick,
  onFilterClick,
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
  // to FilterSheet changes the same way the cash feed does — TransactionFeed
  // calls loader(null) on filter-prop change. Recreated each filter ref
  // change; stable while filter is null/inactive.
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
          <button
            onClick={onFilterClick}
            // Demoted visual weight (#150): lighter color + font-normal so the
            // section title ("最近紀錄") leads the row instead of competing.
            className="text-xs font-normal pb-px cursor-pointer bg-transparent border-0 flex items-center gap-1"
            style={{ color: 'var(--ink-3)' }}
            aria-label={t.dashboard.filterAriaLabel}
          >
            {t.dashboard.filterLabel}{filterActive && <span style={{ color: 'var(--accent)' }}>•</span>} ›
          </button>
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
