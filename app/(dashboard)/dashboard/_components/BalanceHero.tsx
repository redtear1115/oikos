'use client'

import { useState } from 'react'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { PlusIcon } from '@/app/(dashboard)/_components/PlusIcon'
import { viewerBalance } from '@/lib/balance'
import { SettlementForm } from './SettlementForm'

interface Props {
  rawBalance: number  // member_a perspective (positive = b owes a)
  onAddClick: () => void
  /** Called after a successful settlement so the parent can router.refresh(). */
  onSettleMutated?: () => void
}

export function BalanceHero({ rawBalance, onAddClick, onSettleMutated }: Props) {
  const { viewer, partner, viewerIsA } = useMember()
  const balance = viewerBalance(rawBalance, viewerIsA)
  const [settleOpen, setSettleOpen] = useState(false)

  // balance > 0 → 對方 欠你; balance < 0 → 你 欠對方; balance == 0 → 打平
  let owedByWho: 'M' | 'T'
  let subjectName: string
  let verb: string
  if (balance > 0) {
    owedByWho = 'T'
    subjectName = partner?.displayName ?? '對方'
    verb = '欠你'
  } else if (balance < 0) {
    owedByWho = 'M'
    subjectName = '你'
    verb = '欠對方'
  } else {
    owedByWho = 'M'
    subjectName = '目前'
    verb = '打平'
  }

  const amount = Math.abs(balance)
  const showInitial = owedByWho === 'M' ? viewer.initial : (partner?.initial ?? '?')
  const canSettle = balance !== 0

  return (
    <div className="px-5 pt-6 pb-5">
      <button
        type="button"
        onClick={() => canSettle && setSettleOpen((v) => !v)}
        disabled={!canSettle}
        className="w-full text-left bg-transparent border-0 cursor-pointer disabled:cursor-default p-0"
        aria-expanded={settleOpen}
        aria-label={canSettle ? '記錄還款 / 收款' : undefined}
      >
        <div className="flex items-start gap-[14px]">
          <Avatar who={owedByWho} initial={showInitial} size={44} />
          <div className="flex-1 pt-[2px] min-w-0">
            <div className="text-sm mb-1" style={{ color: 'var(--ink-2)' }}>
              <span className="font-semibold" style={{ color: 'var(--ink)' }}>{subjectName}</span>{' '}
              <span>{verb}</span>
            </div>
            <div className="tnum leading-[1.05] tracking-[-1.4px]"
              style={{
                fontFamily: 'var(--font-numeric)',
                fontSize: 44,
                fontWeight: 600,
                color: 'var(--ink)',
              }}>
              <span className="text-[22px] font-medium mr-1" style={{ color: 'var(--ink-2)' }}>NT$</span>
              {amount.toLocaleString('en-US')}
            </div>
          </div>
          {canSettle && (
            <div
              className="self-center text-[22px] transition-transform duration-200"
              style={{
                color: 'var(--ink-3)',
                transform: settleOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
              aria-hidden="true"
            >
              ⌄
            </div>
          )}
        </div>
      </button>

      {!settleOpen && (
        <div className="flex gap-2 mt-[18px]">
          <button onClick={onAddClick}
            className="flex-1 h-[46px] rounded-xl border-0 text-white font-semibold text-sm tracking-[0.3px] cursor-pointer flex items-center justify-center gap-1.5"
            style={{ background: 'var(--ink)' }}>
            <PlusIcon size={16} />新增一筆
          </button>
        </div>
      )}

      {settleOpen && canSettle && (
        <SettlementForm
          debtAmount={amount}
          viewerIsDebtor={balance < 0}
          onClose={() => setSettleOpen(false)}
          onMutated={() => {
            onSettleMutated?.()
            setSettleOpen(false)
          }}
        />
      )}
    </div>
  )
}
