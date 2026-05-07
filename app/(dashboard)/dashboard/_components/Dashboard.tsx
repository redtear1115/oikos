'use client'

import { useCallback, useEffect, useReducer, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BrandHeader } from './BrandHeader'
import { ModeTogglePlaceholder } from './ModeTogglePlaceholder'
import { SoloBanner } from './SoloBanner'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { useRealtimeEvents } from '@/app/(dashboard)/_components/RealtimeProvider'
import { BalanceHero } from './BalanceHero'
import { AddSheet, type AddSheetInitial } from './AddSheet'
import { SettlementSheet, type SettlementSheetInitial } from './SettlementSheet'
import { IncomeSheet, type IncomeSheetInitial } from './IncomeSheet'
import { FilterSheet } from '@/app/(dashboard)/records/_components/FilterSheet'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import { PlusIcon } from '@/app/(dashboard)/_components/PlusIcon'
import { TransactionFeed } from '@/app/(dashboard)/_components/TransactionFeed'
import { EmptyState } from './EmptyState'
import { IncomeEmptyState } from './IncomeEmptyState'
import { defaultFilter, isFilterActive, type TxnFilter } from '@/lib/filter'
import type { PagedTxnRow } from '@/actions/transaction'
import { makeIncomeLoader } from '@/lib/incomeFeedRow'
import { CompactRow } from './CompactRow'
import { DEFAULT_INCOME_PALETTE } from '@/lib/incomePalettes'
import { NewFuelLog, type NewFuelLogInitial } from '@/app/(dashboard)/assets/[id]/_components/NewFuelLog'
import { getFuelLogById } from '@/actions/fuelLog'
import { PendingIncomeStack } from './PendingIncomeStack'
import type { PendingRow } from '@/lib/db/queries/recurringIncome'

const SOLO_BANNER_DISMISS_KEY = 'oikos_solo_banner_dismissed'
const incomeLoader = makeIncomeLoader(20)

type ModalState =
  | { kind: 'closed' }
  | { kind: 'add' }
  | { kind: 'income' }
  | { kind: 'edit-income'; data: IncomeSheetInitial }
  | { kind: 'edit-tx'; data: AddSheetInitial }
  | { kind: 'edit-settlement'; data: SettlementSheetInitial }
  | { kind: 'filter' }

export interface DashboardProps {
  balance: number
  recent: PagedTxnRow[]
  pageSize: number
  incomeMonthTotal: number
  incomeMonthCount: number
  recentIncomeLabel: string | null
  recentIncomeFeed: PagedTxnRow[]
  pendings: PendingRow[]
}

export function Dashboard({
  balance,
  recent,
  pageSize,
  incomeMonthTotal,
  incomeMonthCount,
  recentIncomeLabel,
  recentIncomeFeed,
  pendings,
}: DashboardProps) {
  const router = useRouter()
  const { isSolo } = useMember()

  useRealtimeEvents((event) => {
    if (
      event.kind === 'group-updated' ||
      event.kind === 'reconnect' ||
      event.kind === 'income-insert' ||
      event.kind === 'income-update' ||
      event.kind === 'recurring-income-changed'
    ) {
      // Partner accepted the invite (group-updated), or we reconnected after a
      // disconnect that may have missed the event. Re-fetch the layout to get
      // fresh MemberContext (partner profile + isSolo flips to false).
      // Income insert/update: refresh to re-fetch income month summary and hero card data.
      router.refresh()
    }
  })

  const [mode, setMode] = useState<'expense' | 'income'>('expense')
  const [modal, dispatch] = useReducer((_prev: ModalState, next: ModalState) => next, { kind: 'closed' })
  const [filter, setFilter] = useState<TxnFilter | null>(null)

  // Fuel log edit sheet state
  const [fuelSheetOpen, setFuelSheetOpen] = useState(false)
  const [fuelSheetInitial, setFuelSheetInitial] = useState<NewFuelLogInitial | null>(null)
  const [fuelCar, setFuelCar] = useState<{
    id: string; name: string; plate: string
    fuelType: '92' | '95' | '98' | 'diesel' | 'electric' | null
    primaryUserId: string | null
  } | null>(null)
  const [, startFuelLoad] = useTransition()

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

  const sheetOpen = modal.kind !== 'closed'
  const filterActive = filter !== null && isFilterActive(filter)

  const P = DEFAULT_INCOME_PALETTE

  const handleItemClick = (tx: PagedTxnRow) => {
    if (tx.kind === 'income') {
      dispatch({
        kind: 'edit-income',
        data: {
          id: tx.id,
          amount: tx.amount,
          category: tx.category,
          source: tx.description || null,
          recipientId: tx.paidBy,
          assetId: tx.assetId,
          occurredAt: tx.transactedAt.substring(0, 10),
        },
      })
      return
    }

    if (tx.kind === 'settlement') {
      dispatch({
        kind: 'edit-settlement',
        data: {
          id: tx.id,
          amount: tx.amount,
          payerId: tx.paidBy,
          settledAt: tx.transactedAt,
        },
      })
      return
    }

    if (tx.fuelLogId !== null) {
      startFuelLoad(async () => {
        const detail = await getFuelLogById(tx.fuelLogId!)
        if (!detail) return
        setFuelSheetInitial({
          fuelLogId: detail.id,
          transactionId: tx.id,
          liters: detail.liters,
          odometer: detail.odometer,
          station: detail.station,
          fuelType: detail.fuelType === '98' ? '98' : detail.fuelType === 'diesel' ? 'diesel' : '95',
          loggedAt: detail.loggedAt,
          cost: tx.amount,
          paidBy: tx.paidBy,
          splitType: tx.splitType ?? 'all_mine',
        })
        setFuelCar({
          id: detail.assetId,
          name: detail.carName,
          plate: detail.carPlate ?? '',
          fuelType: detail.carFuelType,
          primaryUserId: detail.carPrimaryUserId,
        })
        setFuelSheetOpen(true)
      })
      return
    }

    dispatch({
      kind: 'edit-tx',
      data: {
        id: tx.id,
        amount: tx.amount,
        description: tx.description,
        category: tx.category,
        splitType: tx.splitType!,
        payerId: tx.paidBy,
        transactedAt: tx.transactedAt,
        assetId: tx.assetId,
      },
    })
  }

  const incomeRenderRow = useCallback((tx: PagedTxnRow): React.ReactNode | undefined => {
    if (tx.kind !== 'income') return undefined
    return (
      <div style={{ background: `linear-gradient(90deg, ${P.glow}55, transparent 60%)` }}>
        <CompactRow tx={tx} isLast={false} onClick={() => handleItemClick(tx)} />
      </div>
    )
  }, [handleItemClick])

  const handleClose = () => dispatch({ kind: 'closed' })
  const settlementData = modal.kind === 'edit-settlement' ? modal.data : null

  const handleMutated = () => router.refresh()

  const addOrIncome = mode === 'income' ? 'income' : 'add'

  return (
    <div className="relative min-h-dvh pb-[92px]">
      <BrandHeader />
      {isSolo ? (
        bannerDismissed ? (
          <div className="px-5 pt-6 pb-5">
            <ModeTogglePlaceholder mode={mode} onChange={setMode} />

            <div className="text-xs flex items-center justify-between mb-4" style={{ color: 'var(--ink-3)' }}>
              <span>你還在獨自記帳</span>
              <Link href="/settings" className="underline" style={{ color: 'var(--ink-2)' }}>
                邀請對方 →
              </Link>
            </div>
            <button
              type="button"
              onClick={() => dispatch({ kind: addOrIncome })}
              className="w-full h-[46px] rounded-xl border-0 text-white font-semibold text-sm tracking-[0.3px] cursor-pointer flex items-center justify-center gap-1.5"
              style={{ background: 'var(--ink)' }}
            >
              <PlusIcon size={16} />{mode === 'income' ? '記一筆進帳' : '新增一筆'}
            </button>
          </div>
        ) : (
          <SoloBanner onDismiss={handleDismissBanner} />
        )
      ) : (
        <BalanceHero
          rawBalance={balance}
          onAddClick={() => dispatch({ kind: addOrIncome })}
          onSettleMutated={handleMutated}
          mode={mode}
          onModeChange={setMode}
          incomeMonthTotal={incomeMonthTotal}
          incomeMonthCount={incomeMonthCount}
          recentIncomeLabel={recentIncomeLabel}
        />
      )}
      {mode === 'income' && (
        <div className="px-5">
          <PendingIncomeStack pendings={pendings} />
        </div>
      )}
      <TransactionFeed
        key={mode}
        initial={mode === 'income' ? recentIncomeFeed : recent}
        pageSize={pageSize}
        onItemClick={handleItemClick}
        filter={mode === 'income' ? undefined : (filter ?? undefined)}
        loader={mode === 'income' ? incomeLoader : undefined}
        renderRow={mode === 'income' ? incomeRenderRow : undefined}
        label={
          <div className="flex items-end justify-between">
            <span className="text-xs font-medium tracking-[0.5px]" style={{ color: 'var(--ink-2)' }}>
              最近紀錄
            </span>
            {mode === 'expense' && (
              <button
                onClick={() => dispatch({ kind: 'filter' })}
                className="text-xs font-medium pb-px cursor-pointer bg-transparent border-0 flex items-center gap-1"
                style={{ color: 'var(--ink-2)' }}
                aria-label="開啟篩選"
              >
                篩選{filterActive && <span style={{ color: 'var(--accent)' }}>•</span>} <span style={{ color: 'var(--ink-3)' }}>›</span>
              </button>
            )}
          </div>
        }
        emptyState={
          mode === 'income'
            ? <IncomeEmptyState onAdd={() => dispatch({ kind: 'income' })} />
            : <EmptyState onAdd={() => dispatch({ kind: 'add' })} />
        }
      />
      <BottomNav onAddClick={() => dispatch({ kind: addOrIncome })} hideFab={sheetOpen} />
      <AddSheet
        open={modal.kind === 'add' || modal.kind === 'edit-tx'}
        onClose={handleClose}
        initial={modal.kind === 'edit-tx' ? modal.data : undefined}
        onMutated={handleMutated}
      />
      <SettlementSheet
        open={settlementData !== null}
        onClose={handleClose}
        initial={settlementData}
        onMutated={handleMutated}
      />
      <IncomeSheet
        open={modal.kind === 'income' || modal.kind === 'edit-income'}
        onClose={handleClose}
        initial={modal.kind === 'edit-income' ? modal.data : undefined}
        onMutated={handleMutated}
      />
      <FilterSheet
        open={modal.kind === 'filter'}
        current={filter ?? defaultFilter()}
        onClose={() => dispatch({ kind: 'closed' })}
        onApply={(next) => {
          setFilter(isFilterActive(next) ? next : null)
          dispatch({ kind: 'closed' })
        }}
      />

      {fuelCar && (
        <NewFuelLog
          open={fuelSheetOpen}
          onClose={() => setFuelSheetOpen(false)}
          car={fuelCar}
          lastOdometer={null}
          mode="edit"
          initial={fuelSheetInitial}
        />
      )}
    </div>
  )
}
