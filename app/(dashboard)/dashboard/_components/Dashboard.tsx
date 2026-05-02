'use client'

import { useState } from 'react'
import { BrandHeader } from './BrandHeader'
import { BalanceHero } from './BalanceHero'
import { RecentList } from './RecentList'
import { EmptyState } from './EmptyState'
import { AddSheet } from './AddSheet'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'

export interface DashboardProps {
  balance: number
  recent: Array<{
    id: string
    amount: number
    splitType: 'all_mine' | 'all_theirs' | 'half'
    description: string
    category: string
    paidBy: string
    transactedAt: string  // ISO
  }>
}

export function Dashboard({ balance, recent }: DashboardProps) {
  const [addOpen, setAddOpen] = useState(false)

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
        : <RecentList items={recent} />
      }
      <BottomNav onAddClick={() => setAddOpen(true)} />
      <AddSheet open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}
