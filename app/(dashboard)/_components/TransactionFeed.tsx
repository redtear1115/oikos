'use client'

import { useState, useEffect, useTransition } from 'react'
import { CompactRow, type CompactRowProps } from '@/app/(dashboard)/dashboard/_components/CompactRow'
import { MonthSection } from '@/app/(dashboard)/records/_components/MonthSection'
import { groupByMonth } from '@/lib/groupByMonth'
import { loadMoreTransactions, type PagedTxnRow } from '@/actions/transaction'

interface Props {
  initial: PagedTxnRow[]
  pageSize: number
  /** Render this when initial.length === 0 (no records at all). */
  emptyState: React.ReactNode
  /** Called when a row is tapped — parent opens its AddSheet in edit mode. */
  onItemClick: (tx: PagedTxnRow) => void
  /** Optional small label rendered above the list (e.g. "最近紀錄"). */
  label?: React.ReactNode
}

export function TransactionFeed({ initial, pageSize, emptyState, onItemClick, label }: Props) {
  const [items, setItems] = useState<PagedTxnRow[]>(initial)
  const [hasMore, setHasMore] = useState(initial.length === pageSize)
  const [loading, startLoading] = useTransition()
  const [error, setError] = useState('')

  // Resync items + hasMore whenever the server re-renders this component with fresh
  // `initial` (after router.refresh() following a mutation). This loses any "load more"
  // position but guarantees consistent state.
  useEffect(() => {
    setItems(initial)
    setHasMore(initial.length === pageSize)
  }, [initial, pageSize])

  const handleLoadMore = () => {
    if (items.length === 0) return
    setError('')
    const last = items[items.length - 1]
    startLoading(async () => {
      try {
        const more = await loadMoreTransactions(
          { transactedAt: last.transactedAt, createdAt: last.createdAt },
          pageSize,
        )
        setItems((cur) => [...cur, ...more])
        setHasMore(more.length === pageSize)
      } catch (e) {
        setError(e instanceof Error ? e.message : '載入失敗')
      }
    })
  }

  if (items.length === 0) {
    return <>{emptyState}</>
  }

  const groups = groupByMonth(items, (i) => i.transactedAt)

  return (
    <>
      {label && <div className="px-6 pt-2 pb-1">{label}</div>}

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
              {g.items.map((tx, i) => (
                <CompactRow
                  key={tx.id}
                  tx={tx as CompactRowProps['tx']}
                  isLast={i === g.items.length - 1}
                  onClick={tx.kind === 'transaction' ? () => onItemClick(tx) : undefined}
                />
              ))}
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
          className="fixed left-1/2 top-4 z-[110] -translate-x-1/2 w-[calc(100%-32px)] max-w-[calc(28rem-32px)] px-4 py-3 rounded-xl text-sm text-white"
          style={{ background: 'var(--debit)' }}
        >
          {error}
        </div>
      )}
    </>
  )
}
