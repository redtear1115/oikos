'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BrandHeader } from './BrandHeader'
import { BalanceHero } from './BalanceHero'
import { EmptyState } from './EmptyState'
import { AddSheet, type AddSheetInitial } from './AddSheet'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import { TransactionFeed } from '@/app/(dashboard)/_components/TransactionFeed'
import type { PagedTxnRow } from '@/actions/transaction'

export interface DashboardProps {
  balance: number
  recent: PagedTxnRow[]
  pageSize: number
}

export function Dashboard({ balance, recent, pageSize }: DashboardProps) {
  const router = useRouter()
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<AddSheetInitial | null>(null)

  const sheetOpen = addOpen || editing !== null

  const handleItemClick = (tx: PagedTxnRow) => {
    // Settlements (kind='settlement') have null splitType and will be handled in Task 3.
    // For now, only transactions reach this path; the non-null assertion is safe.
    if (!tx.splitType) return
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
    setAddOpen(false)
    setEditing(null)
  }

  const handleMutated = () => router.refresh()

  return (
    <div className="relative min-h-screen pb-[92px]">
      <BrandHeader />
      <BalanceHero
        rawBalance={balance}
        onAddClick={() => setAddOpen(true)}
        onSettleClick={() => { /* Phase 1c */ }}
      />
      <TransactionFeed
        initial={recent}
        pageSize={pageSize}
        onItemClick={handleItemClick}
        label={
          <span className="text-xs font-medium tracking-[0.5px]" style={{ color: 'var(--ink-2)' }}>
            最近紀錄
          </span>
        }
        emptyState={<EmptyState onAdd={() => setAddOpen(true)} />}
      />
      <BottomNav onAddClick={() => setAddOpen(true)} hideFab={sheetOpen} />
      <AddSheet
        open={sheetOpen}
        onClose={handleClose}
        initial={editing ?? undefined}
        onMutated={handleMutated}
      />
    </div>
  )
}
