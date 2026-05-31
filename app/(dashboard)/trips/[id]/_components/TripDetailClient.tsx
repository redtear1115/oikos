'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import { CompactRow } from '@/app/(dashboard)/dashboard/_components/CompactRow'
import type { AddSheetInitial, RateEntry } from '@/app/(dashboard)/dashboard/_components/AddSheet'
import type { TripOption } from '@/app/(dashboard)/dashboard/_components/TripSelector'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import type { TripSheetInitial } from '@/app/(dashboard)/trips/_components/TripSheet'
import { EndTripSheet } from './EndTripSheet'

// Sheets only mount on user action — lazy-load to trim the trip-detail
// page's initial JS bundle (#670 audit 6.1).
const AddSheet = dynamic(
  () => import('@/app/(dashboard)/dashboard/_components/AddSheet').then(m => m.AddSheet),
  { ssr: false },
)
const TripSheet = dynamic(
  () => import('@/app/(dashboard)/trips/_components/TripSheet').then(m => m.TripSheet),
  { ssr: false },
)
import { formatAmount, type CurrencyCode } from '@/lib/currency'
import type { SplitType } from '@/lib/balance'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { useTranslations } from '@/lib/i18n/client'

export interface TripDetailRecord {
  id: string
  amount: number
  splitType: 'all_mine' | 'all_theirs' | 'half' | 'weighted'
  splitRatioA: number | null
  description: string
  category: string
  paidBy: string
  transactedAt: string
  originalCurrency: string | null
  originalAmount: number | null
}

interface Props {
  trip: TripSheetInitial & { status: 'active' | 'ended' | 'archived' }
  records: TripDetailRecord[]
  baseCurrency: CurrencyCode
  groupDefaultRatioA: number | null
  activeTrips: TripOption[]
  rates: RateEntry[]
}

export function TripDetailClient({ trip, records, baseCurrency, groupDefaultRatioA, activeTrips, rates }: Props) {
  const router = useRouter()
  const t = useTranslations()
  const { viewer, partner, viewerIsA, isSolo, isPast } = useMember()
  const [editOpen, setEditOpen] = useState(false)
  const [endOpen, setEndOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [expenseEditInitial, setExpenseEditInitial] = useState<AddSheetInitial | null>(null)

  const isEnded = trip.status !== 'active'
  // Write-side affordances (FAB, tap-to-edit, end button) are all gated on
  // the same condition: not in a past epoch and the trip is still active.
  // Server actions reject writes too — UI hide is the primary defence.
  const writeBlocked = isPast || isEnded

  // Per-currency aggregation. For each currency the trip uses (base + any
  // foreign), we accumulate:
  //   - native total / base equivalent / record count
  //   - per-side paid / share in the row's *native* unit
  //   - per-side paid / share in *base* unit (used for the top fold-preview)
  //
  // Both views walk the same record set; doing them in one pass keeps the
  // code honest about what each number means.
  const { byCurrency, perSideBase, totalBase } = useMemo(() => {
    interface CurrencyAgg {
      currency: string
      native: number      // sum of original_amount (or amount when base)
      base: number        // sum of amount (base integer)
      count: number
      aPaidNative: number
      bPaidNative: number
      aShareNative: number
      bShareNative: number
    }
    const map = new Map<string, CurrencyAgg>()
    let totalBaseSum = 0
    let aPaidBase = 0
    let bPaidBase = 0
    let aShareBase = 0
    let bShareBase = 0

    for (const r of records) {
      const cur = (r.originalCurrency ?? baseCurrency).toUpperCase()
      const native = r.originalAmount ?? r.amount
      const payerIs: 'a' | 'b' = r.paidBy === viewer.id
        ? (viewerIsA ? 'a' : 'b')
        : (viewerIsA ? 'b' : 'a')
      const aShareFrac = aShareFraction(r.splitType as SplitType, r.splitRatioA, payerIs)

      const entry = map.get(cur) ?? {
        currency: cur,
        native: 0, base: 0, count: 0,
        aPaidNative: 0, bPaidNative: 0, aShareNative: 0, bShareNative: 0,
      }
      entry.native += native
      entry.base += r.amount
      entry.count += 1
      if (payerIs === 'a') entry.aPaidNative += native
      else entry.bPaidNative += native
      entry.aShareNative += native * aShareFrac
      entry.bShareNative += native * (1 - aShareFrac)
      map.set(cur, entry)

      totalBaseSum += r.amount
      if (payerIs === 'a') aPaidBase += r.amount
      else bPaidBase += r.amount
      aShareBase += r.amount * aShareFrac
      bShareBase += r.amount * (1 - aShareFrac)
    }

    const byCur = Array.from(map.values()).sort((a, b) => b.base - a.base)

    const perSideBase = (isSolo || !partner) ? null : {
      viewerPaid: viewerIsA ? aPaidBase : bPaidBase,
      partnerPaid: viewerIsA ? bPaidBase : aPaidBase,
      viewerShare: Math.round(viewerIsA ? aShareBase : bShareBase),
      partnerShare: Math.round(viewerIsA ? bShareBase : aShareBase),
    }

    return { byCurrency: byCur, perSideBase, totalBase: totalBaseSum }
  }, [records, baseCurrency, isSolo, partner, viewer.id, viewerIsA])

  return (
    <div className="relative min-h-screen pb-[var(--bottom-nav-offset)]">
      <div
        className="sticky top-0 z-20 px-4 pt-12 pb-3"
        style={{ background: 'var(--bg)' }}
      >
        <div className="flex items-center justify-between gap-2">
          {/* Pop the previous history entry instead of pushing /trips — otherwise
              the back chain becomes [Settings, /trips, /trips/[id], /trips] and
              hitting back on /trips loops to /trips/[id]. Cold-load (no in-app
              history) falls back to /trips so the link doesn't dead-end. */}
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined' && window.history.length > 1) {
                router.back()
              } else {
                router.push('/trips')
              }
            }}
            className="flex items-center gap-1.5 min-h-11 px-2 -ml-2 bg-transparent w-fit cursor-pointer"
            style={{ color: 'var(--ink-2)', fontSize: 'var(--fs-sm)', border: 'none' }}
            aria-label="返回旅行列表"
          >
            <svg width="8" height="13" viewBox="0 0 8 13" fill="none" aria-hidden="true">
              <path
                d="M6.5 1.5L1.5 6.5L6.5 11.5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>旅行</span>
          </button>
          {!isPast && !isEnded ? (
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              aria-label={t.tripDetail.editAriaLabel}
              className="min-w-11 min-h-11 -mr-2 flex items-center justify-center bg-transparent cursor-pointer"
              style={{ border: 'none' }}
            >
              <span
                className="w-[30px] h-[30px] rounded-chip flex items-center justify-center"
                style={{ background: 'rgba(31,27,22,0.06)' }}
                aria-hidden="true"
              >
                <svg width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path
                    d="M8.2 1.8l2 2-6.4 6.4-2.4.4.4-2.4 6.4-6.4z"
                    stroke="var(--ink)"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </svg>
              </span>
            </button>
          ) : (
            <div className="min-w-11" aria-hidden="true" />
          )}
        </div>

        {/* Title block lives inside the sticky region so the trip name + status
            stay visible while scrolling through long expense lists — pattern
            matches AibutsuHeader on /assets/[id]. */}
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h1
              className="text-2xl font-medium tracking-tight truncate"
              style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}
            >
              {trip.name}
            </h1>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--ink-3)' }}>
              {trip.endDate
                ? `${trip.startDate} – ${trip.endDate}`
                : `${trip.startDate} 起,進行中`}
            </p>
          </div>
          {isEnded && (
            <span
              className="shrink-0 px-2 py-0.5 rounded-full text-xs tracking-[0.5px]"
              style={{
                background: 'var(--hairline)',
                color: 'var(--ink-2)',
              }}
            >
              已結束
            </span>
          )}
        </div>
      </div>

      {/* Top section — end-trip fold preview in base currency. Shows the
          total + (duo mode) per-side paid/share. This is the view the user
          will see in the main ledger once they end the trip. */}
      <section className="mt-4 px-4">
        <div
          className="rounded-card p-5"
          style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs tracking-[1.5px] uppercase" style={{ color: 'var(--ink-3)' }}>
                {t.tripDetail.totalLabel}
              </p>
              <p
                className="mt-1 text-3xl font-medium tnum tracking-[-0.5px]"
                style={{ color: 'var(--ink)', fontFamily: 'var(--font-numeric)' }}
              >
                {formatAmount(totalBase, baseCurrency)}
              </p>
            </div>
            <span
              className="shrink-0 mt-1 px-2 py-0.5 rounded-full text-xs tracking-[0.5px]"
              style={{
                background: 'var(--hairline)',
                color: 'var(--ink-2)',
                fontFamily: 'var(--font-numeric)',
              }}
              title={t.tripDetail.baseCurrencyTagTitle}
            >
              {t.tripDetail.baseCurrencyTag.replace('{code}', baseCurrency.toUpperCase())}
            </span>
          </div>

          {perSideBase && (
            <div className="mt-4 flex gap-3">
              <PerSideMemberCard
                memberRole={viewerIsA ? 'a' : 'b'}
                avatarUrl={viewer.avatarUrl ?? null}
                initial={(viewer.displayName?.[0] ?? '?').toUpperCase()}
                label={t.tripDetail.youPaid}
                paid={perSideBase.viewerPaid}
                share={perSideBase.viewerShare}
                currency={baseCurrency}
                shareLabel={t.tripDetail.share}
              />
              <PerSideMemberCard
                memberRole={viewerIsA ? 'b' : 'a'}
                avatarUrl={partner?.avatarUrl ?? null}
                initial={(partner?.displayName?.[0] ?? '?').toUpperCase()}
                label={t.tripDetail.partnerPaid.replace('{name}', partner?.displayName ?? '')}
                paid={perSideBase.partnerPaid}
                share={perSideBase.partnerShare}
                currency={baseCurrency}
                shareLabel={t.tripDetail.share}
              />
            </div>
          )}
        </div>
      </section>

      {/* Mid-trip per-currency view — only when the trip mixes currencies.
          Each row carries the native total, base equivalent, and (duo mode)
          per-member paid + share IN NATIVE UNITS so the row is self-contained
          for the "while I'm still in Japan, how much have we each spent in
          JPY" reading. */}
      {byCurrency.length > 1 && (
        <section className="mt-5 px-4">
          <div
            className="text-xs tracking-[1.5px] uppercase px-1 pb-2"
            style={{ color: 'var(--ink-3)' }}
          >
            {t.tripDetail.currencyBreakdown}
          </div>
          <div className="flex flex-col gap-2">
            {byCurrency.map((row) => (
              <CurrencyBreakdownCard
                key={row.currency}
                row={row}
                baseCurrency={baseCurrency}
                showPerSide={!isSolo && !!partner}
                viewer={{
                  avatarUrl: viewer.avatarUrl ?? null,
                  initial: (viewer.displayName?.[0] ?? '?').toUpperCase(),
                  isA: viewerIsA,
                }}
                partner={partner ? {
                  avatarUrl: partner.avatarUrl ?? null,
                  initial: (partner.displayName?.[0] ?? '?').toUpperCase(),
                  displayName: partner.displayName ?? '',
                } : null}
                t={t.tripDetail}
              />
            ))}
          </div>
        </section>
      )}

      <section className="mt-5 px-4">
        <div className="flex items-center justify-between px-1 pb-2">
          <div
            className="text-xs tracking-[1.5px] uppercase"
            style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}
          >
            {t.tripDetail.recordsCountLabel.replace('{n}', String(records.length))}
          </div>
        </div>

        {records.length === 0 ? (
          <div
            className="rounded-tile py-10 px-6 text-center text-sm leading-relaxed"
            style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--ink-3)' }}
          >
            {isEnded ? t.tripDetail.emptyEnded : t.tripDetail.emptyActive}
          </div>
        ) : (
          <div
            className="rounded-tile overflow-hidden"
            style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
          >
            {records.map((r, i) => {
              const onRowClick = !writeBlocked ? () => setExpenseEditInitial({
                id: r.id,
                kind: 'trip-expense',
                tripId: trip.id,
                amount: r.amount,
                description: r.description,
                category: r.category,
                splitType: r.splitType,
                splitRatioA: r.splitRatioA,
                payerId: r.paidBy,
                transactedAt: r.transactedAt,
              }) : undefined
              return (
                <CompactRow
                  key={r.id}
                  tx={{
                    id: r.id,
                    amount: r.amount,
                    splitType: r.splitType,
                    splitRatioA: r.splitRatioA,
                    description: r.description,
                    category: r.category,
                    paidBy: r.paidBy,
                    transactedAt: r.transactedAt,
                    kind: 'transaction',
                    notes: null,
                    status: 'settled',
                    originalCurrency: r.originalCurrency,
                    originalAmount: r.originalAmount,
                  }}
                  isLast={i === records.length - 1}
                  baseCurrency={baseCurrency}
                  onClick={onRowClick}
                />
              )
            })}
          </div>
        )}
      </section>

      {/* Destructive entry: ending a trip writes summary CashTransactions into
          the main ledger and cannot be reversed. Styled to match Settings →
          DangerZone (leave group). Past-epoch + already-ended views hide it. */}
      {!isPast && !isEnded && (
        <section className="mt-8 px-4">
          <button
            type="button"
            onClick={() => setEndOpen(true)}
            className="w-full flex items-center justify-between px-5 py-4 rounded-card text-left bg-transparent cursor-pointer"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--destructive-soft)',
              color: 'var(--destructive)',
            }}
          >
            <div className="text-sm font-medium">{t.tripDetail.endTitle}</div>
            <div className="text-sm">›</div>
          </button>
        </section>
      )}

      <BottomNav onAddClick={() => setAddOpen(true)} hideFab={writeBlocked} />

      <TripSheet
        open={editOpen}
        baseCurrency={baseCurrency}
        onClose={() => setEditOpen(false)}
        initial={trip}
      />

      {/* Create sheet — locked to this trip via prefilledTripId. */}
      <AddSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onMutated={() => { setAddOpen(false); router.refresh() }}
        baseCurrency={baseCurrency}
        groupDefaultRatioA={groupDefaultRatioA}
        activeTrips={activeTrips}
        rates={rates}
        prefilledTripId={trip.id}
      />

      {/* Edit sheet — driven by tap-to-edit on the row list. */}
      <AddSheet
        open={expenseEditInitial !== null}
        initial={expenseEditInitial ?? undefined}
        onClose={() => setExpenseEditInitial(null)}
        onMutated={() => { setExpenseEditInitial(null); router.refresh() }}
        baseCurrency={baseCurrency}
        groupDefaultRatioA={groupDefaultRatioA}
        activeTrips={activeTrips}
        rates={rates}
      />

      <EndTripSheet
        open={endOpen}
        tripId={trip.id}
        startDate={trip.startDate}
        suggestedEndDate={trip.endDate ?? new Date().toISOString().slice(0, 10)}
        onClose={() => setEndOpen(false)}
      />
    </div>
  )
}

/**
 * One half of the per-side fold preview. Avatar + member label, then
 * "付了 NT$X" and "分擔: NT$Y" stacked below. Works for both the top fold-
 * preview (base currency) and per-currency native rows.
 */
function PerSideMemberCard(props: {
  memberRole: 'a' | 'b'
  avatarUrl: string | null
  initial: string
  label: string
  paid: number
  share: number
  currency: string
  shareLabel: string
}) {
  return (
    <div
      className="flex-1 rounded-bubble p-3 flex gap-2.5 items-start"
      style={{ background: 'var(--bg)', border: '1px solid var(--hairline)' }}
    >
      <Avatar
        memberRole={props.memberRole}
        initial={props.initial}
        src={props.avatarUrl}
        size={28}
      />
      <div className="min-w-0 flex-1">
        <div className="text-xs tracking-[0.5px] truncate" style={{ color: 'var(--ink-3)' }}>
          {props.label}
        </div>
        <div
          className="mt-0.5 text-base font-medium tnum tracking-[-0.2px]"
          style={{ color: 'var(--ink)', fontFamily: 'var(--font-numeric)' }}
        >
          {formatAmount(props.paid, props.currency)}
        </div>
        <div className="text-xs tnum mt-0.5" style={{ color: 'var(--ink-3)' }}>
          {props.shareLabel}: {formatAmount(props.share, props.currency)}
        </div>
      </div>
    </div>
  )
}

/**
 * One currency row in the mid-trip per-currency block. Header line carries
 * the native total + base equivalent + record count; the body (duo only)
 * carries per-side paid/share in NATIVE units of this currency.
 */
function CurrencyBreakdownCard(props: {
  row: {
    currency: string
    native: number
    base: number
    count: number
    aPaidNative: number
    bPaidNative: number
    aShareNative: number
    bShareNative: number
  }
  baseCurrency: string
  showPerSide: boolean
  viewer: { avatarUrl: string | null; initial: string; isA: boolean }
  partner: { avatarUrl: string | null; initial: string; displayName: string } | null
  t: {
    youPaid: string
    partnerPaid: string
    share: string
    recordsSuffix: string
  }
}) {
  const { row, baseCurrency, showPerSide, viewer, partner, t: ts } = props
  const isBase = row.currency === baseCurrency.toUpperCase()
  // Aggregated native amounts may have float remainders (from share fractions).
  // Round before display so the column doesn't show "5000.0000…".
  const round = (n: number) => Math.round(n)
  return (
    <div
      className="rounded-tile"
      style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
    >
      <div className="flex items-baseline justify-between px-4 pt-3 pb-2">
        <div className="flex flex-col">
          <span
            className="text-sm font-medium tracking-wide"
            style={{ color: 'var(--ink)', fontFamily: 'var(--font-numeric)' }}
          >
            {row.currency}
          </span>
          <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
            {row.count} {ts.recordsSuffix}
          </span>
        </div>
        <div className="text-right">
          <div
            className="text-base font-medium tnum"
            style={{ color: 'var(--ink)', fontFamily: 'var(--font-numeric)' }}
          >
            {formatAmount(row.native, row.currency)}
          </div>
          {!isBase && (
            <div className="text-xs tnum mt-0.5" style={{ color: 'var(--ink-3)' }}>
              ≈ {formatAmount(row.base, baseCurrency)}
            </div>
          )}
        </div>
      </div>
      {showPerSide && partner && (
        <div className="px-3 pb-3 flex gap-2">
          <PerSideMemberCard
            memberRole={viewer.isA ? 'a' : 'b'}
            avatarUrl={viewer.avatarUrl}
            initial={viewer.initial}
            label={ts.youPaid}
            paid={round(viewer.isA ? row.aPaidNative : row.bPaidNative)}
            share={round(viewer.isA ? row.aShareNative : row.bShareNative)}
            currency={row.currency}
            shareLabel={ts.share}
          />
          <PerSideMemberCard
            memberRole={viewer.isA ? 'b' : 'a'}
            avatarUrl={partner.avatarUrl}
            initial={partner.initial}
            label={ts.partnerPaid.replace('{name}', partner.displayName)}
            paid={round(viewer.isA ? row.bPaidNative : row.aPaidNative)}
            share={round(viewer.isA ? row.bShareNative : row.aShareNative)}
            currency={row.currency}
            shareLabel={ts.share}
          />
        </div>
      )}
    </div>
  )
}

/**
 * Fraction of a record that member A carries after the split. Used by the
 * per-currency × per-member aggregation to translate a TripExpense (with its
 * splitType + payer + ratio) into a "how much did each side bear" number in
 * any unit (native or base, since the fraction is unitless).
 *
 * Semantics:
 *   - 'half'        → 50/50
 *   - 'all_mine'    → payer carries 100%
 *   - 'all_theirs'  → non-payer carries 100% (the "you spotted me" case)
 *   - 'weighted'    → splitRatioA% / (100 - splitRatioA)%
 */
function aShareFraction(
  splitType: SplitType,
  splitRatioA: number | null,
  payerIs: 'a' | 'b',
): number {
  switch (splitType) {
    case 'half':       return 0.5
    case 'all_mine':   return payerIs === 'a' ? 1 : 0
    case 'all_theirs': return payerIs === 'a' ? 0 : 1
    case 'weighted':   return splitRatioA == null ? 0.5 : splitRatioA / 100
  }
}

