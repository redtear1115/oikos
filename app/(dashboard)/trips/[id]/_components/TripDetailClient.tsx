'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import { CompactRow } from '@/app/(dashboard)/dashboard/_components/CompactRow'
import { AddSheet, type AddSheetInitial } from '@/app/(dashboard)/dashboard/_components/AddSheet'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { SheetShell } from '@/app/(dashboard)/assets/_components/AssetSheet/shared/SheetShell'
import { TripSheet, type TripSheetInitial } from '@/app/(dashboard)/trips/_components/TripSheet'
import { endTrip } from '@/actions/trip'
import { formatAmount, type CurrencyCode } from '@/lib/currency'

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
}

export function TripDetailClient({ trip, records, baseCurrency }: Props) {
  const router = useRouter()
  const { isPast } = useMember()
  const [editOpen, setEditOpen] = useState(false)
  const [endOpen, setEndOpen] = useState(false)
  const [expenseEditInitial, setExpenseEditInitial] = useState<AddSheetInitial | null>(null)

  const isEnded = trip.status !== 'active'
  const totalBase = records.reduce((sum, r) => sum + r.amount, 0)
  const displayCurrency = trip.defaultCurrency ?? baseCurrency
  const usesForeignDefault = displayCurrency !== baseCurrency

  return (
    <div className="relative min-h-screen pb-[var(--bottom-nav-offset)]">
      <div
        className="sticky top-0 z-20 px-4 pt-12 pb-2"
        style={{ background: 'var(--bg)' }}
      >
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
      </div>

      <header className="px-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h1
              className="text-2xl font-medium tracking-tight"
              style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}
            >
              {trip.name}
            </h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--ink-3)' }}>
              {trip.endDate
                ? `${trip.startDate} – ${trip.endDate}`
                : `${trip.startDate} 起,進行中`}
            </p>
          </div>
          {isEnded && (
            <span
              className="shrink-0 mt-1 px-2 py-0.5 rounded-full text-[11px] tracking-[0.5px]"
              style={{
                background: 'var(--hairline)',
                color: 'var(--ink-2)',
              }}
            >
              已結束
            </span>
          )}
        </div>
      </header>

      <section className="px-4">
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
            這趟還沒有任何紀錄。<br />
            從首頁加一筆,選到這次旅行,就會收進來。
          </div>
        ) : (
          <div
            className="rounded-[18px] overflow-hidden"
            style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
          >
            {records.map((r, i) => {
              const canEdit = !isPast && !isEnded
              const onRowClick = canEdit ? () => setExpenseEditInitial({
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

      {/* Edit + End trip CTAs — past-epoch read-only view hides both. */}
      {!isPast && (
        <section className="mt-6 px-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="w-full h-12 rounded-[14px] text-sm font-medium cursor-pointer"
            style={{
              background: 'var(--surface)',
              color: 'var(--ink)',
              border: '1px solid var(--hairline)',
            }}
          >
            編輯這趟旅行
          </button>
          {!isEnded && (
            <button
              type="button"
              onClick={() => setEndOpen(true)}
              className="w-full h-12 rounded-[14px] text-sm font-medium cursor-pointer"
              style={{
                background: 'transparent',
                color: 'var(--ink-2)',
                border: '1px dashed var(--ink-3)',
              }}
            >
              結束這趟旅行
            </button>
          )}
        </section>
      )}

      <BottomNav onAddClick={() => {}} hideFab />

      <TripSheet
        open={editOpen}
        baseCurrency={baseCurrency}
        onClose={() => setEditOpen(false)}
        initial={trip}
      />

      <AddSheet
        open={expenseEditInitial !== null}
        initial={expenseEditInitial ?? undefined}
        onClose={() => setExpenseEditInitial(null)}
        onMutated={() => { setExpenseEditInitial(null); router.refresh() }}
        baseCurrency={baseCurrency}
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

function EndTripSheet(props: {
  open: boolean
  tripId: string
  startDate: string
  suggestedEndDate: string
  onClose: () => void
}) {
  const router = useRouter()
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
        setErr(e instanceof Error ? e.message : '結束失敗')
      }
    })
  }

  return (
    <SheetShell
      open={props.open}
      title="結束這趟旅行"
      canSave={canSave}
      pending={pending}
      bottomSaveLabel="確認結束"
      error={err ?? ''}
      onClose={props.onClose}
      onSave={submit}
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          結束之後這趟還會留在列表裡,只是不再接新的紀錄。日期之後還能再編輯。
        </p>

        <label className="block">
          <span className="text-sm" style={{ color: 'var(--ink-2)' }}>結束日</span>
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
            結束日不可早於起始日({props.startDate})
          </p>
        )}
      </div>
    </SheetShell>
  )
}
