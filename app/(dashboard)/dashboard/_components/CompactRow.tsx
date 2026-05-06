'use client'

import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { CategoryChip } from '@/app/(dashboard)/_components/CategoryChip'
import { getIncomeCategory } from '@/lib/incomeCategories'

export interface CompactRowProps {
  tx: {
    id: string
    amount: number
    splitType: 'all_mine' | 'all_theirs' | 'half' | null
    description: string
    category: string
    paidBy: string
    transactedAt: string
    kind: 'transaction' | 'settlement' | 'income'
  }
  isLast: boolean
  onClick?: () => void
}

export function CompactRow({ tx, isLast, onClick }: CompactRowProps) {
  const { viewer, partner } = useMember()
  const payerIsViewer = tx.paidBy === viewer.id
  const payerInitial = payerIsViewer ? viewer.initial : (partner?.initial ?? '?')
  const payerAvatar = payerIsViewer ? viewer.avatarUrl : (partner?.avatarUrl ?? null)
  const payerLabel = tx.kind === 'settlement'
    ? (payerIsViewer ? '我還款' : `${partner?.displayName ?? '對方'} 還款`)
    : tx.kind === 'income'
    ? (payerIsViewer ? '你收入' : `${partner?.displayName ?? '對方'} 收入`)
    : (payerIsViewer ? '你付' : `${partner?.displayName ?? '對方'} 付`)

  // Delta is only meaningful for transactions. Settlements just transfer cash —
  // they don't change anyone's "share owed" for this individual row.
  let delta = 0
  if (tx.kind === 'transaction') {
    if (tx.splitType === 'all_theirs') {
      delta = payerIsViewer ? +tx.amount : -tx.amount
    } else if (tx.splitType === 'half') {
      delta = payerIsViewer ? +Math.ceil(tx.amount / 2) : -Math.ceil(tx.amount / 2)
    }
  }

  const dColor = delta > 0 ? 'var(--credit)' : delta < 0 ? 'var(--debit)' : 'var(--ink-3)'
  const showDelta = tx.kind === 'transaction'

  // For income rows, fall back to category label when source/description is empty.
  const displayLabel = tx.kind === 'income'
    ? (tx.description || getIncomeCategory(tx.category).label)
    : tx.description

  // M/D format
  const d = new Date(tx.transactedAt)
  const dateLabel = `${d.getMonth() + 1}/${d.getDate()}`

  const inner = (
    <>
      <CategoryChip categoryId={tx.category} size={32} />
      <div className="flex-1 min-w-0 text-left">
        <div className="text-sm font-medium mb-0.5" style={{ color: 'var(--ink)' }}>
          {displayLabel}
        </div>
        <div
          className="text-micro flex items-center gap-1.5"
          style={{ color: 'var(--ink-3)' }}
        >
          {dateLabel} · <Avatar who={payerIsViewer ? 'M' : 'T'} initial={payerInitial} src={payerAvatar} size={16} /> {payerLabel}
        </div>
      </div>
      <div className="text-right">
        <div
          className="tnum text-sm font-medium tracking-[-0.2px]"
          style={{ fontFamily: 'var(--font-numeric)', color: 'var(--ink)' }}
        >
          NT${tx.amount.toLocaleString('en-US')}
        </div>
        {showDelta && (
          <div className="tnum text-micro mt-px" style={{ color: dColor }}>
            {delta === 0 ? '—' : (delta > 0 ? '+' : '−') + Math.abs(delta).toLocaleString('en-US')}
          </div>
        )}
      </div>
    </>
  )

  const cls = "w-full flex items-center gap-3 px-[14px] py-3 text-left bg-transparent border-0"
  const style = { borderBottom: isLast ? 'none' : '1px solid var(--hairline)' }

  if (onClick) {
    return (
      <button onClick={onClick} className={`${cls} cursor-pointer transition-colors duration-100 hover:bg-[rgba(31,27,22,0.03)]`} style={style}>
        {inner}
      </button>
    )
  }

  return (
    <div className={cls} style={style}>
      {inner}
    </div>
  )
}
