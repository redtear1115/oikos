'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BrandHeader } from './BrandHeader'
import { SoloBanner } from './SoloBanner'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { useRealtimeEvents } from '@/app/(dashboard)/_components/RealtimeProvider'
import { BalanceHero } from './BalanceHero'
import { EmptyState } from './EmptyState'
import { AddSheet, type AddSheetInitial } from './AddSheet'
import { SettlementSheet, type SettlementSheetInitial } from './SettlementSheet'
import { FilterSheet } from '@/app/(dashboard)/records/_components/FilterSheet'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import { PlusIcon } from '@/app/(dashboard)/_components/PlusIcon'
import { TransactionFeed } from '@/app/(dashboard)/_components/TransactionFeed'
import { defaultFilter, isFilterActive, type TxnFilter } from '@/lib/filter'
import type { PagedTxnRow } from '@/actions/transaction'

const SOLO_BANNER_DISMISS_KEY = 'oikos_solo_banner_dismissed'

export interface DashboardProps {
  balance: number
  recent: PagedTxnRow[]
  pageSize: number
}

export function Dashboard({ balance, recent, pageSize }: DashboardProps) {
  const router = useRouter()
  const { isSolo } = useMember()

  useRealtimeEvents((event) => {
    if (event.kind === 'group-updated' || event.kind === 'reconnect') {
      // Partner accepted the invite (group-updated), or we reconnected after a
      // disconnect that may have missed the event. Re-fetch the layout to get
      // fresh MemberContext (partner profile + isSolo flips to false).
      router.refresh()
    }
  })

  const [addOpen, setAddOpen] = useState(false)
  const [editingTx, setEditingTx] = useState<AddSheetInitial | null>(null)
  const [editingSettlement, setEditingSettlement] = useState<SettlementSheetInitial | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [filter, setFilter] = useState<TxnFilter | null>(null)

  // SoloBanner dismissal — persisted in localStorage, hydrated on mount.
  // SSR renders the banner; on first client paint we may swap to the fallback hero.
  const [bannerDismissed, setBannerDismissed] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    setBannerDismissed(window.localStorage.getItem(SOLO_BANNER_DISMISS_KEY) === 'true')
  }, [])
  const handleDismissBanner = () => {
    window.localStorage.setItem(SOLO_BANNER_DISMISS_KEY, 'true')
    setBannerDismissed(true)
  }

  const sheetOpen = addOpen || editingTx !== null || editingSettlement !== null || filterOpen
  const filterActive = filter !== null && isFilterActive(filter)

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
        assetId: tx.assetId,
      })
    }
  }

  const handleClose = () => {
    setAddOpen(false)
    setEditingTx(null)
    setEditingSettlement(null)
  }

  const handleMutated = () => router.refresh()

  return (
    <div className="relative min-h-screen pb-[92px]">
      <BrandHeader />
      {isSolo ? (
        bannerDismissed ? (
          <div className="px-5 pt-6 pb-5">
            <div className="text-xs flex items-center justify-between mb-4" style={{ color: 'var(--ink-3)' }}>
              <span>你還在獨自記帳</span>
              <Link href="/settings" className="underline" style={{ color: 'var(--ink-2)' }}>
                邀請對方 →
              </Link>
            </div>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="w-full h-[46px] rounded-xl border-0 text-white font-semibold text-sm tracking-[0.3px] cursor-pointer flex items-center justify-center gap-1.5"
              style={{ background: 'var(--ink)' }}
            >
              <PlusIcon size={16} />新增一筆
            </button>
          </div>
        ) : (
          <SoloBanner onDismiss={handleDismissBanner} />
        )
      ) : (
        <BalanceHero
          rawBalance={balance}
          onAddClick={() => setAddOpen(true)}
          onSettleMutated={handleMutated}
        />
      )}
      <TransactionFeed
        initial={recent}
        pageSize={pageSize}
        onItemClick={handleItemClick}
        filter={filter ?? undefined}
        label={
          <div className="flex items-end justify-between">
            <span className="text-xs font-medium tracking-[0.5px]" style={{ color: 'var(--ink-2)' }}>
              最近紀錄
            </span>
            <button
              onClick={() => setFilterOpen(true)}
              className="text-xs font-medium pb-px cursor-pointer bg-transparent border-0 flex items-center gap-1"
              style={{ color: 'var(--ink-2)' }}
              aria-label="開啟篩選"
            >
              篩選{filterActive && <span style={{ color: 'var(--accent)' }}>•</span>} <span style={{ color: 'var(--ink-3)' }}>›</span>
            </button>
          </div>
        }
        emptyState={<EmptyState onAdd={() => setAddOpen(true)} />}
      />
      <BottomNav onAddClick={() => setAddOpen(true)} hideFab={sheetOpen} />
      <AddSheet
        open={addOpen || editingTx !== null}
        onClose={handleClose}
        initial={editingTx ?? undefined}
        onMutated={handleMutated}
      />
      <SettlementSheet
        open={editingSettlement !== null}
        onClose={handleClose}
        initial={editingSettlement}
        onMutated={handleMutated}
      />
      <FilterSheet
        open={filterOpen}
        current={filter ?? defaultFilter()}
        onClose={() => setFilterOpen(false)}
        onApply={(next) => {
          setFilter(isFilterActive(next) ? next : null)
          setFilterOpen(false)
        }}
      />
    </div>
  )
}
