'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AddSheet, type AddSheetInitial } from '@/app/(dashboard)/dashboard/_components/AddSheet'
import { SettlementSheet, type SettlementSheetInitial } from '@/app/(dashboard)/dashboard/_components/SettlementSheet'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import { TransactionFeed } from '@/app/(dashboard)/_components/TransactionFeed'
import { FilterSheet } from './FilterSheet'
import { defaultFilter, isFilterActive, type TxnFilter } from '@/lib/filter'
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
  const [filterOpen, setFilterOpen] = useState(false)
  // `null` = no filter active (TransactionFeed owns the unfiltered initial list).
  // Once the user applies any filter, this becomes a TxnFilter object.
  const [filter, setFilter] = useState<TxnFilter | null>(null)

  const sheetOpen = editingTx !== null || editingSettlement !== null || adding || filterOpen

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

  const filterActive = filter !== null && isFilterActive(filter)

  return (
    <div className="relative min-h-screen pb-[92px]">
      <div className="px-5 pt-[60px] pb-2 flex items-end justify-between">
        <div
          className="text-2xl font-medium tracking-tight"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}
        >
          紀錄
        </div>
        <button
          onClick={() => setFilterOpen(true)}
          className="text-xs font-medium pb-1 cursor-pointer bg-transparent border-0 flex items-center gap-1"
          style={{ color: 'var(--ink-2)' }}
          aria-label="開啟篩選"
        >
          篩選{filterActive && <span style={{ color: 'var(--accent)' }}>•</span>} <span style={{ color: 'var(--ink-3)' }}>›</span>
        </button>
      </div>

      <TransactionFeed
        initial={initial}
        pageSize={pageSize}
        onItemClick={handleItemClick}
        filter={filter ?? undefined}
        emptyState={
          <div className="px-6 py-16 text-center text-sm" style={{ color: 'var(--ink-3)' }}>
            {filterActive ? '沒有符合條件的紀錄' : '還沒有紀錄。按下方 + 記第一筆吧。'}
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
      <FilterSheet
        open={filterOpen}
        current={filter ?? defaultFilter()}
        onClose={() => setFilterOpen(false)}
        onApply={(next) => {
          // Setting back to a default filter clears (becomes null) so TransactionFeed
          // re-syncs to the unfiltered server-rendered initial list.
          setFilter(isFilterActive(next) ? next : null)
          setFilterOpen(false)
        }}
      />
    </div>
  )
}
