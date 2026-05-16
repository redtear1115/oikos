'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import { CompactRow } from '@/app/(dashboard)/dashboard/_components/CompactRow'
import { AddSheet, type AddSheetInitial, type RateEntry } from '@/app/(dashboard)/dashboard/_components/AddSheet'
import type { TripOption } from '@/app/(dashboard)/dashboard/_components/TripSelector'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { SheetShell } from '@/app/(dashboard)/assets/_components/AssetSheet/shared/SheetShell'
import { TripSheet, type TripSheetInitial } from '@/app/(dashboard)/trips/_components/TripSheet'
import { endTrip } from '@/actions/trip'
import { formatAmount, type CurrencyCode } from '@/lib/currency'
import { transactionDelta, type SplitType } from '@/lib/balance'
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
  const totalBase = records.reduce((sum, r) => sum + r.amount, 0)
  const displayCurrency = trip.defaultCurrency ?? baseCurrency
  const usesForeignDefault = displayCurrency !== baseCurrency

  // Per-currency breakdown. Each row groups records by their `originalCurrency`
  // (base-currency rows fall into the `baseCurrency` bucket). We surface both
  // the native total and the base-currency equivalent so the bicultural reader
  // can read either side. Shown only when the trip has > 1 currency.
  const currencyBreakdown = useMemo(() => {
    const map = new Map<string, { native: number; base: number; count: number }>()
    for (const r of records) {
      const cur = (r.originalCurrency ?? baseCurrency) as string
      const native = r.originalAmount ?? r.amount
      const entry = map.get(cur) ?? { native: 0, base: 0, count: 0 }
      entry.native += native
      entry.base += r.amount
      entry.count += 1
      map.set(cur, entry)
    }
    return Array.from(map.entries())
      .map(([currency, agg]) => ({ currency: currency as CurrencyCode, ...agg }))
      .sort((a, b) => b.base - a.base)
  }, [records, baseCurrency])

  // Per-side contribution: how much each member actually paid out of pocket
  // vs. how much they carry after splits. Mirrors lib/balance.transactionDelta
  // so this view agrees with the group balance. Solo mode skips the block.
  // TripExpenses have no `status` column — all rows are settled by design,
  // so we don't filter the way the main ledger does.
  const perSide = useMemo(() => {
    if (isSolo || !partner) return null
    let aPaid = 0
    let bPaid = 0
    let aShare = 0
    let bShare = 0
    for (const r of records) {
      const payerIs: 'a' | 'b' = r.paidBy === viewer.id
        ? (viewerIsA ? 'a' : 'b')
        : (viewerIsA ? 'b' : 'a')
      if (payerIs === 'a') aPaid += r.amount
      else bPaid += r.amount
      const delta = transactionDelta({
        amount: r.amount,
        splitType: r.splitType as SplitType,
        payerIs,
        splitRatioA: r.splitRatioA ?? undefined,
      })
      if (payerIs === 'a') {
        aShare += r.amount - delta
        bShare += delta
      } else {
        bShare += r.amount + delta
        aShare += -delta
      }
    }
    return {
      viewerPaid: viewerIsA ? aPaid : bPaid,
      partnerPaid: viewerIsA ? bPaid : aPaid,
      viewerShare: viewerIsA ? aShare : bShare,
      partnerShare: viewerIsA ? bShare : aShare,
    }
  }, [records, isSolo, partner, viewer.id, viewerIsA])

  return (
    <div className="relative min-h-screen pb-[var(--bottom-nav-offset)]">
      <div
        className="sticky top-0 z-20 px-4 pt-12 pb-3"
        style={{ background: 'var(--bg)' }}
      >
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/trips"
            className="flex items-center gap-1.5 min-h-11 px-2 -ml-2 bg-transparent w-fit no-underline"
            style={{ color: 'var(--ink-2)', fontSize: 'var(--fs-sm)' }}
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
          </Link>
          {!isPast && !isEnded ? (
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              aria-label={t.tripDetail.editAriaLabel}
              className="min-w-11 min-h-11 -mr-2 flex items-center justify-center bg-transparent cursor-pointer"
              style={{ border: 'none' }}
            >
              <span
                className="w-[30px] h-[30px] rounded-[10px] flex items-center justify-center"
                style={{ background: 'rgba(31,27,22,0.06)' }}
                aria-hidden="true"
              >
                <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
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
              className="shrink-0 px-2 py-0.5 rounded-full text-[11px] tracking-[0.5px]"
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

      <section className="mt-4 px-4">
        <div
          className="rounded-[20px] p-5"
          style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
        >
          <p className="text-micro tracking-[1.5px] uppercase" style={{ color: 'var(--ink-3)' }}>
            這趟一共花了
          </p>
          <p
            className="mt-1 text-3xl font-medium tnum tracking-[-0.5px]"
            style={{ color: 'var(--ink)', fontFamily: 'var(--font-numeric)' }}
          >
            {formatAmount(totalBase, baseCurrency)}
          </p>
          {usesForeignDefault && (
            <p className="mt-2 text-xs" style={{ color: 'var(--ink-3)' }}>
              這趟預設用 {displayCurrency.toUpperCase()} 記帳,上方為以 {baseCurrency.toUpperCase()} 結算後的金額。
            </p>
          )}
        </div>
      </section>

      {/* Currency breakdown — only when there's more than one currency. */}
      {currencyBreakdown.length > 1 && (
        <section className="mt-5 px-4">
          <div
            className="text-micro tracking-[1.5px] uppercase px-1 pb-2"
            style={{ color: 'var(--ink-3)' }}
          >
            {t.tripDetail.currencyBreakdown}
          </div>
          <div
            className="rounded-[18px] overflow-hidden"
            style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
          >
            {currencyBreakdown.map((row, i) => (
              <div
                key={row.currency}
                className="flex items-baseline justify-between px-4 py-3"
                style={{
                  borderBottom: i === currencyBreakdown.length - 1 ? 'none' : '1px solid var(--hairline)',
                }}
              >
                <div className="flex flex-col">
                  <span
                    className="text-sm font-medium tracking-wide"
                    style={{ color: 'var(--ink)', fontFamily: 'var(--font-numeric)' }}
                  >
                    {row.currency.toUpperCase()}
                  </span>
                  <span className="text-micro" style={{ color: 'var(--ink-3)' }}>
                    {row.count} {t.tripDetail.recordsSuffix}
                  </span>
                </div>
                <div className="text-right">
                  <div
                    className="text-base font-medium tnum"
                    style={{ color: 'var(--ink)', fontFamily: 'var(--font-numeric)' }}
                  >
                    {formatAmount(row.native, row.currency)}
                  </div>
                  {row.currency !== baseCurrency && (
                    <div className="text-xs tnum mt-0.5" style={{ color: 'var(--ink-3)' }}>
                      ≈ {formatAmount(row.base, baseCurrency)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Per-side contribution — solo mode skips this entire block. */}
      {perSide && (
        <section className="mt-5 px-4">
          <div
            className="text-micro tracking-[1.5px] uppercase px-1 pb-2"
            style={{ color: 'var(--ink-3)' }}
          >
            {t.tripDetail.perSideContribution}
          </div>
          <div
            className="rounded-[18px] p-4 flex gap-3"
            style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
          >
            <PerSideCard
              label={t.tripDetail.youPaid}
              paid={perSide.viewerPaid}
              share={perSide.viewerShare}
              currency={baseCurrency}
              shareLabel={t.tripDetail.share}
            />
            <PerSideCard
              label={t.tripDetail.partnerPaid.replace('{name}', partner?.displayName ?? '')}
              paid={perSide.partnerPaid}
              share={perSide.partnerShare}
              currency={baseCurrency}
              shareLabel={t.tripDetail.share}
            />
          </div>
          <p className="text-micro px-1 mt-2" style={{ color: 'var(--ink-3)' }}>
            {t.tripDetail.perSideHint}
          </p>
        </section>
      )}

      <section className="mt-5 px-4">
        <div className="flex items-center justify-between px-1 pb-2">
          <div
            className="text-micro tracking-[1.5px] uppercase"
            style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}
          >
            這趟的紀錄 · {records.length} 筆
          </div>
        </div>

        {records.length === 0 ? (
          <div
            className="rounded-[18px] py-10 px-6 text-center text-sm leading-relaxed"
            style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--ink-3)' }}
          >
            {isEnded ? t.tripDetail.emptyEnded : t.tripDetail.emptyActive}
          </div>
        ) : (
          <div
            className="rounded-[18px] overflow-hidden"
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
            className="w-full flex items-center justify-between px-5 py-4 rounded-[20px] text-left bg-transparent cursor-pointer"
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

function PerSideCard(props: {
  label: string
  paid: number
  share: number
  currency: CurrencyCode
  shareLabel: string
}) {
  return (
    <div
      className="flex-1 rounded-[14px] p-3"
      style={{ background: 'var(--bg)', border: '1px solid var(--hairline)' }}
    >
      <div className="text-micro tracking-[0.5px]" style={{ color: 'var(--ink-3)' }}>
        {props.label}
      </div>
      <div
        className="mt-1 text-base font-medium tnum tracking-[-0.2px]"
        style={{ color: 'var(--ink)', fontFamily: 'var(--font-numeric)' }}
      >
        {formatAmount(props.paid, props.currency)}
      </div>
      <div className="text-xs tnum mt-0.5" style={{ color: 'var(--ink-3)' }}>
        {props.shareLabel}: {formatAmount(props.share, props.currency)}
      </div>
    </div>
  )
}

function EndTripSheet(props: {
  open: boolean
  tripId: string
  startDate: string
  suggestedEndDate: string
  onClose: () => void
}) {
  const router = useRouter()
  const t = useTranslations()
  const [endDate, setEndDate] = useState(props.suggestedEndDate)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!props.open) return
    setEndDate(props.suggestedEndDate)
    setErr(null)
  }, [props.open, props.suggestedEndDate])

  const dateInvalid = endDate < props.startDate
  const canSave = !dateInvalid && !pending

  function submit() {
    if (!canSave) return
    setErr(null)
    start(async () => {
      try {
        await endTrip({ tripId: props.tripId, endDate })
        props.onClose()
        router.refresh()
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : t.tripDetail.endFailure)
      }
    })
  }

  return (
    <SheetShell
      open={props.open}
      title={t.tripDetail.endTitle}
      canSave={canSave}
      pending={pending}
      bottomSaveLabel={t.tripDetail.endConfirm}
      error={err ?? ''}
      onClose={props.onClose}
      onSave={submit}
      destructive
    >
      <div className="flex flex-col gap-3">
        <div
          className="rounded-[12px] px-3 py-2.5 text-sm leading-relaxed"
          style={{
            background: 'var(--debit-soft)',
            color: 'var(--destructive)',
          }}
          role="alert"
        >
          {t.tripDetail.endIrreversibleNote}
        </div>

        <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          {t.tripDetail.endBody}
        </p>

        <label className="block">
          <span className="text-sm" style={{ color: 'var(--ink-2)' }}>{t.tripDetail.endDateLabel}</span>
          <input
            type="date"
            className="mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm"
            style={{
              background: 'var(--surface)',
              border: dateInvalid ? '1px solid var(--debit, #c0392b)' : '1px solid var(--hairline)',
              color: 'var(--ink)',
            }}
            min={props.startDate}
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
          />
        </label>

        {dateInvalid && (
          <p className="text-xs" style={{ color: 'var(--debit, #c0392b)' }}>
            {t.tripDetail.endDateBeforeStart.replace('{date}', props.startDate)}
          </p>
        )}
      </div>
    </SheetShell>
  )
}
