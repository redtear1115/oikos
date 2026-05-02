'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CompactRow, type CompactRowProps } from '@/app/(dashboard)/dashboard/_components/CompactRow'
import { AddSheet, type AddSheetInitial } from '@/app/(dashboard)/dashboard/_components/AddSheet'
import { MonthSection } from './MonthSection'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import { groupByMonth } from '@/lib/groupByMonth'
import { loadMoreTransactions, type PagedTxnRow } from '@/actions/transaction'

interface Props {
  initial: PagedTxnRow[]
  pageSize: number  // typically 20; receiving fewer = no more pages
}

export function RecordsList({ initial, pageSize }: Props) {
  const router = useRouter()
  const [items, setItems] = useState<PagedTxnRow[]>(initial)
  const [hasMore, setHasMore] = useState(initial.length === pageSize)
  const [loading, startLoading] = useTransition()
  const [editing, setEditing] = useState<AddSheetInitial | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  // Reset items + hasMore whenever the server re-renders this component with fresh `initial`
  // (after router.refresh() following a mutation). This loses any "load more" position but
  // guarantees consistent state — acceptable for Phase 1b.
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

  const handleItemClick = (tx: PagedTxnRow) => {
    setEditing({
      id: tx.id,
      amount: tx.amount,
      description: tx.description,
      category: tx.category,
      splitType: tx.splitType,
      payerId: tx.paidBy,
      transactedAt: tx.transactedAt,
    })
  }

  const handleMutated = () => {
    // Server action already revalidated; refresh re-renders this server component
    // with new `initial`, the useEffect above resyncs local state.
    router.refresh()
  }

  const handleSheetClose = () => {
    setEditing(null)
    setAdding(false)
  }

  const sheetOpen = editing !== null || adding

  const groups = groupByMonth(items, (i) => i.transactedAt)

  return (
    <div className="relative min-h-screen pb-[92px]">
      <div className="px-5 pt-[60px] pb-2">
        <div
          className="text-2xl font-medium tracking-tight"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}
        >
          紀錄
        </div>
        <div className="text-xs mt-1" style={{ color: 'var(--ink-3)' }}>
          {items.length} 筆已載入
        </div>
      </div>

      {items.length === 0 ? (
        <div className="px-6 py-16 text-center text-sm" style={{ color: 'var(--ink-3)' }}>
          還沒有紀錄。按下方 + 記第一筆吧。
        </div>
      ) : (
        <>
          {groups.map((g) => {
            const total = g.items.reduce((acc, t) => acc + t.amount, 0)
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
                      onClick={() => handleItemClick(tx)}
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
        </>
      )}

      <BottomNav onAddClick={() => setAdding(true)} hideFab={sheetOpen} />

      <AddSheet
        open={sheetOpen}
        onClose={handleSheetClose}
        initial={editing ?? undefined}
        onMutated={handleMutated}
      />

      {error && (
        <div
          className="fixed left-1/2 top-4 z-[110] -translate-x-1/2 w-[calc(100%-32px)] max-w-[calc(28rem-32px)] px-4 py-3 rounded-xl text-sm text-white"
          style={{ background: 'var(--debit)' }}
        >
          {error}
        </div>
      )}
    </div>
  )
}
