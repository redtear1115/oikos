'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AddSheet, type AddSheetInitial } from '@/app/(dashboard)/dashboard/_components/AddSheet'
import { SettlementSheet, type SettlementSheetInitial } from '@/app/(dashboard)/dashboard/_components/SettlementSheet'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import { TransactionFeed } from '@/app/(dashboard)/_components/TransactionFeed'
import type { PagedTxnRow } from '@/actions/transaction'

interface Props {
  initial: PagedTxnRow[]
  pageSize: number
}

export function RecordsList({ initial, pageSize }: Props) {
  const router = useRouter()
  const [editingTx, setEditingTx] = useState<AddSheetInitial | null>(null)
  const [editingSettlement, setEditingSettlement] = useState<SettlementSheetInitial | null>(null)
  const [adding, setAdding] = useState(false)

  const sheetOpen = editingTx !== null || editingSettlement !== null || adding

  const handleItemClick = (tx: PagedTxnRow) => {
    if (tx.kind === 'settlement') {
      setEditingSettlement({
        id: tx.id,
        amount: tx.amount,
        payerId: tx.paidBy,
        settledAt: tx.transactedAt,
      })
    } else {
      setEditingTx({
        id: tx.id,
        amount: tx.amount,
        description: tx.description,
        category: tx.category,
        splitType: tx.splitType!,
        payerId: tx.paidBy,
        transactedAt: tx.transactedAt,
      })
    }
  }

  const handleSheetClose = () => {
    setEditingTx(null)
    setEditingSettlement(null)
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
        open={adding || editingTx !== null}
        onClose={handleSheetClose}
        initial={editingTx ?? undefined}
        onMutated={handleMutated}
      />
      <SettlementSheet
        open={editingSettlement !== null}
        onClose={handleSheetClose}
        initial={editingSettlement}
        onMutated={handleMutated}
      />
    </div>
  )
}
