'use client'

import { useState, useEffect, useTransition } from 'react'
import { CompactRow, type CompactRowProps } from '@/app/(dashboard)/dashboard/_components/CompactRow'
import { MonthSection } from '@/app/(dashboard)/records/_components/MonthSection'
import { groupByMonth } from '@/lib/groupByMonth'
import { loadMoreTransactions, type PagedTxnRow } from '@/actions/transaction'
import { toWire, type TxnFilter, matchesFilter, type FilterableRow } from '@/lib/filter'
import { useRealtimeEvents } from './RealtimeProvider'
import { useMember } from './MemberContext'
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
  /** Optional realtime-insert filter. Called for every txn-insert event;
   *  return false to drop the row. Used by asset-scoped feeds. */
  acceptInsert?: (row: TxnRowPayload) => boolean
  /** Optional custom row renderer. Return undefined to use the default CompactRow. */
  renderRow?: (tx: PagedTxnRow) => React.ReactNode | undefined
}

export function TransactionFeed({ initial, pageSize, emptyState, onItemClick, label, header, filter, loader, acceptInsert, renderRow }: Props) {
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
  useEffect(() => {
    if (!filter) return  // handled by the previous effect via `initial`
    setError('')
    startLoading(async () => {
      try {
        const fresh = await loadMoreTransactions(null, pageSize, toWire(filter))
        setItems(fresh)
        setHasMore(fresh.length === pageSize)
      } catch (e) {
        setError(e instanceof Error ? e.message : '載入失敗')
      }
    })
  }, [filter, pageSize])

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
            )
        setItems((cur) => [...cur, ...more])
        setHasMore(more.length === pageSize)
      } catch (e) {
        setError(e instanceof Error ? e.message : '載入失敗')
      }
    })
  }

  const { viewer, partner } = useMember()

  useRealtimeEvents((event) => {
    if (event.kind === 'reconnect') {
      // Refetch page 1 (with current filter, if any) to re-align.
      startLoading(async () => {
        try {
          const fresh = loader
            ? await loader(null)
            : await loadMoreTransactions(null, pageSize, filter ? toWire(filter) : undefined)
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
        description: row.description,
        category: row.category,
        paidBy: row.paidBy,
        transactedAt: row.transactedAt,
        createdAt: row.createdAt,
        kind: 'transaction' as const,
        assetId: row.assetId ?? null,
        fuelLogId: null,  // realtime payload doesn't carry this; fuel-log events handled separately
      }
      if (filter) {
        const f: FilterableRow = { paidBy: row.paidBy, splitType: row.splitType, category: row.category, kind: 'transaction' }
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
          description: row.note ?? '還款',
          category: 'settle',
          paidBy: row.paidBy,
          transactedAt: row.settledAt,
          createdAt: row.createdAt,
          kind: 'settlement' as const,
          assetId: null,
          fuelLogId: null,
        }
        if (filter) {
          const f: FilterableRow = { paidBy: row.paidBy, splitType: null, category: 'settle', kind: 'settlement' }
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
        // Only sum transaction amounts — settlements are transfers, not spend, so
        // including them in the month total inflates the figure misleadingly.
        const total = g.items
          .filter((t) => t.kind === 'transaction')
          .reduce((acc, t) => acc + t.amount, 0)
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
                      tx={tx as CompactRowProps['tx']}
                      isLast={i === g.items.length - 1}
                      onClick={() => onItemClick(tx)}
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
            {loading ? '載入中…' : '載入更多'}
          </button>
        ) : (
          <div className="text-center text-[11px] py-3" style={{ color: 'var(--ink-3)' }}>
            已是最早的紀錄
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
            aria-label="關閉"
            className="bg-transparent border-0 text-white text-base leading-none cursor-pointer p-0"
          >
            ×
          </button>
        </div>
      )}
    </>
  )
}
