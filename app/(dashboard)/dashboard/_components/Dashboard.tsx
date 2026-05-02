'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BrandHeader } from './BrandHeader'
import { BalanceHero } from './BalanceHero'
import { RecentList } from './RecentList'
import { EmptyState } from './EmptyState'
import { AddSheet, type AddSheetInitial } from './AddSheet'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import type { CompactRowProps } from './CompactRow'

export interface DashboardProps {
  balance: number
  recent: CompactRowProps['tx'][]
}

export function Dashboard({ balance, recent }: DashboardProps) {
  const router = useRouter()
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<AddSheetInitial | null>(null)

  const sheetOpen = addOpen || editing !== null

  const handleItemClick = (tx: CompactRowProps['tx']) => {
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

  // Server action revalidated already; refresh re-runs the server component.
  const handleMutated = () => router.refresh()

  return (
    <div className="relative min-h-screen pb-[92px]">
      <BrandHeader />
      <BalanceHero
        rawBalance={balance}
        onAddClick={() => setAddOpen(true)}
        onSettleClick={() => { /* Phase 1c */ }}
      />
      {recent.length === 0
        ? <EmptyState onAdd={() => setAddOpen(true)} />
        : <RecentList items={recent} onItemClick={handleItemClick} />
      }
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
