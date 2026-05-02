'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AddSheet, type AddSheetInitial } from '@/app/(dashboard)/dashboard/_components/AddSheet'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import { TransactionFeed } from '@/app/(dashboard)/_components/TransactionFeed'
import type { PagedTxnRow } from '@/actions/transaction'

interface Props {
  initial: PagedTxnRow[]
  pageSize: number
}

export function RecordsList({ initial, pageSize }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState<AddSheetInitial | null>(null)
  const [adding, setAdding] = useState(false)

  const sheetOpen = editing !== null || adding

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

  const handleClose = () => {
    setEditing(null)
    setAdding(false)
  }

  const handleMutated = () => router.refresh()

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
          {initial.length} 筆已載入
        </div>
      </div>

      <TransactionFeed
        initial={initial}
        pageSize={pageSize}
        onItemClick={handleItemClick}
        emptyState={
          <div className="px-6 py-16 text-center text-sm" style={{ color: 'var(--ink-3)' }}>
            還沒有紀錄。按下方 + 記第一筆吧。
          </div>
        }
      />

      <BottomNav onAddClick={() => setAdding(true)} hideFab={sheetOpen} />

      <AddSheet
        open={sheetOpen}
        onClose={handleClose}
        initial={editing ?? undefined}
        onMutated={handleMutated}
      />
    </div>
  )
}
