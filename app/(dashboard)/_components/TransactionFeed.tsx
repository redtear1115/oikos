'use client'

import { useState, useEffect, useTransition } from 'react'
import { CompactRow } from '@/app/(dashboard)/dashboard/_components/CompactRow'
import { MonthSection } from '@/app/(dashboard)/records/_components/MonthSection'
import { groupByMonth } from '@/lib/groupByMonth'
import { loadMoreTransactions, type PagedTxnRow } from '@/actions/transaction'
import { toWire, type TxnFilter, matchesFilter, type FilterableRow } from '@/lib/filter'
import { useRealtimeEvents } from './RealtimeProvider'
import { useMember } from './MemberContext'
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus'
import { useTranslations } from '@/lib/i18n/client'
import { describeError } from '@/lib/errors'
import type { TxnCursor } from '@/lib/db/queries/transactions'
import type { TxnRowPayload } from '@/lib/realtime/event'

interface Props {
  initial: PagedTxnRow[]
  pageSize: number
  /** Render this when items are empty. */
  emptyState: React.ReactNode
  /** Called when a row is tapped — parent opens its AddSheet / SettlementSheet in edit mode. */
  onItemClick: (tx: PagedTxnRow) => void
  /** Optional small label rendered above the list (e.g. "最近紀錄"). */
  label?: React.ReactNode
  /** Optional header rendered above the list with the current visible count. Use for
   *  counting headers like "時間軸 · N 筆" + secondary action. Mutually exclusive with `label`. */
  header?: (count: number) => React.ReactNode
  /** Optional filter. When this object reference changes, the feed refetches page 1 with
   *  the new filter and replaces its items. Pass `undefined` for "no filter". */
  filter?: TxnFilter
  /** Optional custom loader for pagination. Defaults to global loadMoreTransactions. */
  loader?: (cursor: TxnCursor | null) => Promise<PagedTxnRow[]>
  /** Optional page-level month scope ('YYYY-MM'). Threaded into the fallback
   *  `loadMoreTransactions` calls (filter-change refetch, reconnect refetch,
   *  load-more without custom loader) so the feed stays scoped when the parent
   *  is in month mode. Custom loaders are responsible for their own scoping. */
  monthKey?: string
  /** Optional realtime-insert filter. Called for every txn-insert event;
   *  return false to drop the row. Used by asset-scoped feeds. */
  acceptInsert?: (row: TxnRowPayload) => boolean
  /** Optional custom row renderer. Return undefined to use the default CompactRow. */
  renderRow?: (tx: PagedTxnRow) => React.ReactNode | undefined
}

export function TransactionFeed({ initial, pageSize, emptyState, onItemClick, label, header, filter, loader, monthKey, acceptInsert, renderRow }: Props) {
  const t = useTranslations()
  const online = useOnlineStatus()
  const [items, setItems] = useState<PagedTxnRow[]>(initial)
  const [hasMore, setHasMore] = useState(initial.length === pageSize)
  const [loading, startLoading] = useTransition()
  const [error, setError] = useState('')

  // Resync to initial only when no filter is active (filter mode owns the items list).
  useEffect(() => {
    if (!filter) {
      setItems(initial)
      setHasMore(initial.length === pageSize)
    }
  }, [initial, pageSize, filter])

  // When the filter changes (including becoming undefined → defined), refetch page 1.
  // Custom loaders (e.g. the income loader) own their own filter encoding by
  // closing over it; we just trigger the refetch via `loader(null)` rather than
  // routing through the cash-only loadMoreTransactions path.
  useEffect(() => {
    if (!filter) return  // handled by the previous effect via `initial`
    setError('')
    startLoading(async () => {
      try {
        const fresh = loader
          ? await loader(null)
          : await loadMoreTransactions(null, pageSize, toWire(filter), monthKey)
        setItems(fresh)
        setHasMore(fresh.length === pageSize)
      } catch (e) {
        setError(describeError(e, t.common.error, t.common.offlineError))
      }
    })
  }, [filter, loader, pageSize, monthKey, t])

  // Auto-dismiss error toast after 5s.
  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(''), 5000)
    return () => clearTimeout(t)
  }, [error])

  const handleLoadMore = () => {
    if (items.length === 0) return
    setError('')
    const last = items[items.length - 1]
    startLoading(async () => {
      try {
        const more = loader
          ? await loader({ transactedAt: last.transactedAt, createdAt: last.createdAt })
          : await loadMoreTransactions(
              { transactedAt: last.transactedAt, createdAt: last.createdAt },
              pageSize,
              filter ? toWire(filter) : undefined,
              monthKey,
            )
        setItems((cur) => [...cur, ...more])
        setHasMore(more.length === pageSize)
      } catch (e) {
        setError(describeError(e, t.common.error, t.common.offlineError))
      }
    })
  }

  const { viewer, partner, isPast } = useMember()

  useRealtimeEvents((event) => {
    if (event.kind === 'reconnect') {
      // Refetch page 1 (with current filter, if any) to re-align.
      startLoading(async () => {
        try {
          const fresh = loader
            ? await loader(null)
            : await loadMoreTransactions(null, pageSize, filter ? toWire(filter) : undefined, monthKey)
          setItems(fresh)
          setHasMore(fresh.length === pageSize)
        } catch {
          // Silent — reconnect refetch is best-effort.
        }
      })
      return
    }

    if (event.kind === 'txn-insert') {
      const row = event.row
      const feed: PagedTxnRow = {
        id: row.id,
        amount: row.amount,
        splitType: row.splitType,
        splitRatioA: row.splitRatioA ?? null,
        description: row.description,
        category: row.category,
        paidBy: row.paidBy,
        transactedAt: row.transactedAt,
        createdAt: row.createdAt,
        kind: 'transaction' as const,
        assetId: row.assetId ?? null,
        fuelLogId: null,  // realtime payload doesn't carry this; fuel-log events handled separately
        notes: row.notes ?? null,
        status: row.status ?? 'settled',
        originalCurrency: null,  // realtime payload does not carry currency snapshot
        originalAmount: null,
        rateSnapshot: null,
        tripId: null,
      }
      if (filter) {
        const f: FilterableRow = {
          paidBy: row.paidBy,
          splitType: row.splitType,
          category: row.category,
          kind: 'transaction',
          assetId: row.assetId ?? null,
          amount: row.amount,
          status: row.status ?? 'settled',
        }
        if (!matchesFilter(f, filter, viewer.id, partner?.id ?? null)) return
      }
      if (acceptInsert && !acceptInsert(row)) return
      setItems((cur) => {
        if (cur.some((r) => r.id === row.id)) return cur  // dedupe (own-write echo)
        return [feed, ...cur]
      })
      requestAnimationFrame(() => {
        document.querySelector(`[data-rt-id="${row.id}"]`)?.classList.add('rt-flash')
      })
    } else if (event.kind === 'txn-update') {
      const row = event.row
      if (row.deletedAt) {
        const el = document.querySelector(`[data-rt-id="${row.id}"]`)
        el?.classList.add('rt-fading')
        setTimeout(() => {
          setItems((cur) => cur.filter((r) => r.id !== row.id))
        }, 500)
      }
      // Non-delete UPDATE shouldn't happen in our flow (edits = soft-delete + insert),
      // but if it does, leave items as-is to avoid jitter.
    } else if (event.kind === 'settle-insert' || event.kind === 'settle-update') {
      if (loader) return  // asset-scoped feeds never deal with settlements
      const row = event.row
      if (event.kind === 'settle-update' && row.deletedAt) {
        const el = document.querySelector(`[data-rt-id="${row.id}"]`)
        el?.classList.add('rt-fading')
        setTimeout(() => {
          setItems((cur) => cur.filter((r) => r.id !== row.id))
        }, 500)
        return
      }
      if (event.kind === 'settle-insert') {
        const feed: PagedTxnRow = {
          id: row.id,
          amount: row.amount,
          splitType: null,
          splitRatioA: null,
          description: row.note ?? t.transactionFeed.settlementFallback,
          category: 'settle',
          paidBy: row.paidBy,
          transactedAt: row.settledAt,
          createdAt: row.createdAt,
          kind: 'settlement' as const,
          assetId: null,
          fuelLogId: null,
          notes: null,
          status: 'settled',
          originalCurrency: null,
          originalAmount: null,
          rateSnapshot: null,
          tripId: null,
        }
        if (filter) {
          const f: FilterableRow = {
            paidBy: row.paidBy,
            splitType: null,
            category: 'settle',
            kind: 'settlement',
            assetId: null,
            amount: row.amount,
            status: 'settled',
          }
          if (!matchesFilter(f, filter, viewer.id, partner?.id ?? null)) return
        }
        setItems((cur) => {
          if (cur.some((r) => r.id === row.id)) return cur
          return [feed, ...cur]
        })
        requestAnimationFrame(() => {
          document.querySelector(`[data-rt-id="${row.id}"]`)?.classList.add('rt-flash')
        })
      }
    }
  })

  if (items.length === 0) {
    return <>{emptyState}</>
  }

  const groups = groupByMonth(items, (i) => i.transactedAt)

  return (
    <>
      {label && <div className="px-6 pt-2 pb-1">{label}</div>}
      {header && <div className="px-4 pt-[18px] pb-2">{header(items.length)}</div>}

      {groups.map((g) => {
        // Pick the primary amount based on what kinds the group contains.
        // - All-income (income tab): sum income amounts
        // - Otherwise (expense / all tab): sum transaction amounts only.
        //   Settlements are transfers (not spend) and income amounts mix
        //   dimensions, so excluding them keeps the number meaningful.
        // The verbose "支出 X · 收入 Y · 淨 Z" surface lives in the stats
        // card above the feed; this header just restates count + total
        // for the group below it (unified across all three tabs).
        const isIncomeOnly = g.items.length > 0 && g.items.every((t) => t.kind === 'income')
        const total = isIncomeOnly
          ? g.items.reduce((acc, t) => acc + t.amount, 0)
          : g.items.filter((t) => t.kind === 'transaction').reduce((acc, t) => acc + t.amount, 0)
        return (
          <div key={g.monthKey}>
            <MonthSection monthKey={g.monthKey} count={g.items.length} totalAmount={total} />
            <div
              className="mx-4 rounded-[18px] overflow-hidden"
              style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
            >
              {g.items.map((tx, i) => {
                const custom = renderRow?.(tx)
                if (custom !== undefined) {
                  return <div key={tx.id} data-rt-id={tx.id}>{custom}</div>
                }
                return (
                  <div key={tx.id} data-rt-id={tx.id}>
                    <CompactRow
                      tx={tx}
                      isLast={i === g.items.length - 1}
                      // Past-epoch view is read-only — drop tap-to-edit affordance.
                      // Server actions also reject; this hides the entry point.
                      onClick={isPast ? undefined : () => onItemClick(tx)}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      <div className="px-4 pt-6 pb-2">
        {hasMore ? (
          online ? (
            <button
              onClick={handleLoadMore}
              disabled={loading}
              className="w-full h-11 rounded-[14px] text-sm font-medium cursor-pointer disabled:opacity-50"
              style={{
                background: 'var(--surface)',
                color: 'var(--ink-2)',
                border: '1px solid var(--hairline)',
              }}
            >
              {loading ? t.transactionFeed.loading : t.transactionFeed.loadMore}
            </button>
          ) : (
            <div className="text-center text-micro py-3" style={{ color: 'var(--ink-3)' }}>
              {t.records.offlineMoreNeedsNetwork}
            </div>
          )
        ) : (
          <div className="text-center text-micro py-3" style={{ color: 'var(--ink-3)' }}>
            {t.transactionFeed.endOfFeed}
          </div>
        )}
      </div>

      {error && (
        <div
          className="fixed left-1/2 top-4 z-[110] -translate-x-1/2 w-[calc(100%-32px)] max-w-[calc(28rem-32px)] px-4 py-3 rounded-xl text-sm text-white flex items-center gap-3"
          style={{ background: 'var(--debit)' }}
        >
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError('')}
            aria-label={t.transactionFeed.closeAriaLabel}
            className="bg-transparent border-0 text-white text-base leading-none cursor-pointer p-0"
          >
            ×
          </button>
        </div>
      )}
    </>
  )
}
