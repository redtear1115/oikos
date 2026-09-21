'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { BrandHeader } from './BrandHeader'
import { ModeTogglePlaceholder } from './ModeTogglePlaceholder'
import { ContextStrip } from '@/app/(dashboard)/_components/ContextStrip'
import { SoloMonthHero } from './SoloMonthHero'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { useRealtimeEvents } from '@/app/(dashboard)/_components/RealtimeProvider'
import { BalanceHero } from './BalanceHero'
import { ContinuityRow, type ReviewCellState } from './ContinuityRow'
import type { RateEntry } from './AddSheet'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import { defaultFilter, type TxnFilter, type PayerFilter, type BurdenFilter } from '@/lib/filter'
import type { PagedTxnRow } from '@/actions/transaction'
import { NewFuelLog } from '@/app/(dashboard)/assets/[id]/_components/NewFuelLog'
import { getFuelLogById } from '@/actions/fuelLog'
import { PendingIncomeStack } from './PendingIncomeStack'
import { PendingExpenseStack } from './PendingExpenseStack'
import { FirstRecordCard } from './FirstRecordCard'
import type { PendingRow } from '@/lib/db/queries/recurringIncome'
import type { PendingExpenseRow } from '@/lib/db/queries/recurringExpense'
import { useTranslations } from '@/lib/i18n/client'
import type { CurrencyCode } from '@/lib/currency'
import type { TripOption } from './TripSelector'
import { useDashboardReducer, type DashboardPayer, type DashboardSplit } from './useDashboardReducer'
import { DashboardFilterRow } from './DashboardFilterRow'
import { DashboardFeed, DashboardFeedSkeleton } from './DashboardFeed'
import { unwrapAction } from '@/lib/action-errors'

// Sheets are heavy and only meaningful on user interaction (FAB tap, edit-row
// tap, ✈ button). Split into separate chunks and skip SSR so they don't bloat
// the initial Dashboard bundle. (#616)
const AddSheet = dynamic(() => import('./AddSheet').then((m) => m.AddSheet), { ssr: false })
const SettlementSheet = dynamic(() => import('./SettlementSheet').then((m) => m.SettlementSheet), { ssr: false })
const IncomeSheet = dynamic(() => import('./IncomeSheet').then((m) => m.IncomeSheet), { ssr: false })
const TripSheet = dynamic(() => import('@/app/(dashboard)/trips/_components/TripSheet').then((m) => m.TripSheet), { ssr: false })

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
  /** Solo expense hero (#1118). Only summed when the viewer is solo — a duo
   *  renders BalanceHero here and never reads these. */
  expenseMonthTotal: number
  expenseMonthCount: number
  /** 'YYYY-MM' the two figures above were summed over; also what the hero
   *  labels itself with, so figure and label cannot drift apart. */
  expenseMonthKey: string
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
  /** UI-preference initial states, read from cookies in the page so SSR matches
   *  the client and the collapse toggles don't cause a hydration mismatch. */
  initialHeroCollapsed: boolean
  initialIncludePending: boolean
  initialTripCollapsed: boolean
  /** 月回顧 cell of the ContinuityRow (#1364), decided on the server. */
  reviewCell: ReviewCellState
}

export function Dashboard({
  balance,
  pendingBalanceDelta,
  pageSize,
  incomeMonthTotal,
  incomeMonthCount,
  recentIncomeLabel,
  expenseMonthTotal,
  expenseMonthCount,
  expenseMonthKey,
  pendings,
  expensePendings,
  feedDataPromise,
  groupDefaultRatioA,
  baseCurrency = 'twd',
  activeTrips = [],
  rates = [],
  initialHeroCollapsed,
  initialIncludePending,
  initialTripCollapsed,
  reviewCell,
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

  // L3 filter dims — two independent dual-toggle pills (payer / split),
  // both Dashboard-local (no FilterSheet on this page; full filter lives
  // on /records). Both sides selected = no filter; only one side =
  // narrow to that side. The split dim covers `all_mine` / `all_theirs`;
  // ratio-based modes (`half` + `weighted`) are intentionally only
  // visible when both sides are selected — matches how the user reads
  // those records. See `useDashboardReducer.ts` for the full state shape.
  const [state, dispatch] = useDashboardReducer()
  const { mode, modal, payerFilter, splitFilter, tripSheetOpen, fuelSheet, showFirstCard, toast } = state

  const [, startFuelLoad] = useTransition()

  // Toast timer ref lives outside the reducer — clearing is a side effect,
  // and we need a stable ref across renders. The reducer only owns the
  // visible toast string; this ref owns the cleanup handle.
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showToast = useCallback((msg: string, durationMs = 2500) => {
    dispatch({ type: 'setToast', toast: msg })
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => dispatch({ type: 'setToast', toast: null }), durationMs)
  }, [dispatch])
  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current) }, [])

  const setMode = useCallback((next: 'expense' | 'income') => dispatch({ type: 'setMode', mode: next }), [dispatch])
  const setPayerFilter = useCallback((next: DashboardPayer) => dispatch({ type: 'setPayerFilter', value: next }), [dispatch])
  const setSplitFilter = useCallback((next: DashboardSplit) => dispatch({ type: 'setSplitFilter', value: next }), [dispatch])

  const sheetOpen = modal.kind !== 'closed'

  // Compose L3 toggles into a TxnFilter for the feed. Both dims are
  // optional; when both are 'all' we pass null so TransactionFeed skips
  // its filter branch entirely (no realtime mismatch, no wire roundtrip).
  // The split toggle drives the `burden` dim (who actually bears cost,
  // resolved by combining paid_by × split_type) — NOT the `split` dim
  // (raw DB split_type). See `BurdenFilter` in lib/filter.ts for why.
  const effectiveFilter = useMemo<TxnFilter | null>(() => {
    const payer: PayerFilter =
      payerFilter === 'me' ? 'mine' : payerFilter === 'partner' ? 'theirs' : 'all'
    const burden: BurdenFilter =
      splitFilter === 'mine' ? 'mine' : splitFilter === 'theirs' ? 'theirs' : 'all'
    if (payer === 'all' && burden === 'all') return null
    return { ...defaultFilter(), payer, burden }
  }, [payerFilter, splitFilter])

  const handleItemClick = useCallback((tx: PagedTxnRow) => {
    // Past-epoch view is read-only — never open an edit sheet, even if a
    // child row missed the gate. Defence in depth on top of TransactionFeed
    // and the custom income renderRow already dropping their onClick.
    if (isPast) return
    if (tx.kind === 'income') {
      dispatch({
        type: 'openModal',
        modal: {
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
        },
      })
      return
    }

    if (tx.kind === 'settlement') {
      dispatch({
        type: 'openModal',
        modal: {
          kind: 'edit-settlement',
          data: {
            id: tx.id,
            amount: tx.amount,
            payerId: tx.paidBy,
            settledAt: tx.transactedAt,
          },
        },
      })
      return
    }

    if (tx.fuelLogId !== null) {
      startFuelLoad(async () => {
        const detail = unwrapAction(await getFuelLogById(tx.fuelLogId!))
        if (!detail) return
        dispatch({
          type: 'openFuelSheet',
          initial: {
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
          },
          car: {
            id: detail.assetId,
            name: detail.carName,
            fuelType: detail.carFuelType,
            primaryUserId: detail.carPrimaryUserId,
          },
        })
      })
      return
    }

    dispatch({
      type: 'openModal',
      modal: {
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
      },
    })
  }, [startFuelLoad, isPast, dispatch])

  const handleClose = () => dispatch({ type: 'closeModal' })
  const settlementData = modal.kind === 'edit-settlement' ? modal.data : null

  const handleMutated = (info?: MutatedInfo) => {
    if (info?.isFirstTransaction) dispatch({ type: 'setShowFirstCard', show: true })
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
      <BrandHeader showTripButton={activeTrips.length === 0} onTripClick={() => dispatch({ type: 'openTripSheet' })} />
      {/* L3: Contextual strip (offline / past-epoch / active-trip) */}
      <ContextStrip
        activeTrips={activeTrips}
        baseCurrency={baseCurrency}
        initialTripCollapsed={initialTripCollapsed}
      />
      {/* L2: Mode toggle — left-aligned */}
      <div className="px-5 pb-3">
        <ModeTogglePlaceholder
          mode={mode}
          onChange={setMode}
          incomePendingCount={pendings.length}
          expensePendingCount={expensePendings.length}
        />
      </div>
      {/* L3 filter row — collapses in solo mode (only one person, no real
          split decisions). See DashboardFilterRow for the toggle details. */}
      {!isSolo && partner && (
        <DashboardFilterRow
          payerFilter={payerFilter}
          splitFilter={splitFilter}
          onPayerChange={setPayerFilter}
          onSplitChange={setSplitFilter}
          viewerIsA={viewerIsA}
          t={t}
        />
      )}
      {/* Hero slot. Only the expense side ever differed by member count: a
          solo ledger has no balance to show, so it shows the month instead.
          The income branch of BalanceHero never involved a partner, so solo
          and duo share it. (#1118)

          Nothing at all while pinned to a past chapter (#1131). The figures
          come from `monthlyStatsByCategory`, which ANDs "this calendar month"
          against the pinned epoch's rows — an intersection that is empty for
          any chapter that closed before this month. The hero would render
          "{current month} · NT$ 0 · 0 筆": a heading holding an opinion about a
          month that is not in this chapter. PRODUCT.md's rule is to not
          surface a number the user cannot act on, and a past chapter is
          read-only by design, so there is no version of this figure worth
          showing here.

          Do NOT "fix" this by falling back to BalanceHero: `getGroupBalance()`
          takes no epoch argument, so it would show the *current* balance
          inside a frozen chapter. Honest and empty beats wrong. */}
      {isSolo && mode === 'expense' ? (
        isPast ? null : (
          <SoloMonthHero
            monthKey={expenseMonthKey}
            total={expenseMonthTotal}
            count={expenseMonthCount}
            baseCurrency={baseCurrency}
          />
        )
      ) : (
        <BalanceHero
          rawBalance={balance}
          initialHeroCollapsed={initialHeroCollapsed}
          initialIncludePending={initialIncludePending}
          pendingBalanceDelta={pendingBalanceDelta}
          onSettleMutated={handleMutated}
          mode={mode}
          incomeMonthTotal={incomeMonthTotal}
          incomeMonthCount={incomeMonthCount}
          recentIncomeLabel={recentIncomeLabel}
          baseCurrency={baseCurrency}
        />
      )}
      {/* Always-there entries to 月回顧 / 旅行 (#1364). Not on a pinned past
          chapter: that view is a read-only snapshot, and ContextStrip already
          steps aside there for the same reason. */}
      {!isPast && <ContinuityRow review={reviewCell} hasActiveTrip={activeTrips.length > 0} />}
      {mode === 'expense' && expensePendings.length > 0 && (
        <div className="px-5">
          <PendingExpenseStack
            pendings={expensePendings}
            onEdit={(p) => dispatch({
              type: 'openModal',
              modal: {
                kind: 'edit-pending-expense',
                pendingId: p.id,
                data: {
                  id: p.id,
                  amount: p.proposedAmount,
                  description: p.proposedDescription,
                  category: p.category,
                  splitType: p.proposedSplitType,
                  splitRatioA: p.proposedSplitRatioA,
                  payerId: p.proposedPaidBy,
                  // Construct as local midnight so AddSheet's getFullYear/Month/Date
                  // round-trip yields the original YYYY-MM-DD regardless of timezone.
                  transactedAt: `${p.proposedDate}T00:00:00`,
                  assetId: p.assetId,
                  notes: null,
                },
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
              type: 'openModal',
              modal: {
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
          onAddIncome={() => dispatch({ type: 'openModal', modal: { kind: 'income' } })}
          onAddTx={() => dispatch({ type: 'openModal', modal: { kind: 'add' } })}
        />
      </Suspense>
      <BottomNav onAddClick={() => dispatch({ type: 'openModal', modal: { kind: addOrIncome } })} hideFab={sheetOpen || isPast} />
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
      {fuelSheet.car && (
        <NewFuelLog
          open={fuelSheet.open}
          onClose={() => dispatch({ type: 'closeFuelSheet' })}
          car={fuelSheet.car}
          lastOdometer={null}
          mode="edit"
          initial={fuelSheet.initial}
        />
      )}

      <TripSheet
        open={tripSheetOpen}
        baseCurrency={baseCurrency}
        onClose={() => dispatch({ type: 'closeTripSheet' })}
        onSaved={() => {
          dispatch({ type: 'closeTripSheet' })
          router.refresh()
        }}
      />

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed left-1/2 top-4 z-top-toast -translate-x-1/2 w-[calc(100%-32px)] max-w-[calc(28rem-32px)] px-4 py-3 rounded-bubble text-sm text-white text-center"
          style={{ background: 'var(--ink)' }}
        >
          {toast}
        </div>
      )}

      <FirstRecordCard
        show={showFirstCard}
        onDismiss={() => dispatch({ type: 'setShowFirstCard', show: false })}
      />
    </div>
  )
}
