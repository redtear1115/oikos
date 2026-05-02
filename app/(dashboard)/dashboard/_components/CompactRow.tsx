'use client'

import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { CategoryChip } from '@/app/(dashboard)/_components/CategoryChip'

export interface CompactRowProps {
  tx: {
    id: string
    amount: number
    splitType: 'all_mine' | 'all_theirs' | 'half' | null
    description: string
    category: string
    paidBy: string
    transactedAt: string
    kind: 'transaction' | 'settlement'
  }
  isLast: boolean
  onClick?: () => void
}

export function CompactRow({ tx, isLast, onClick }: CompactRowProps) {
  const { viewer, partner } = useMember()
  const payerIsViewer = tx.paidBy === viewer.id
  const payerInitial = payerIsViewer ? viewer.initial : (partner?.initial ?? '?')
  const payerLabel = tx.kind === 'settlement'
    ? (payerIsViewer ? '我還款' : `${partner?.displayName ?? '對方'} 還款`)
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

  // M/D format
  const d = new Date(tx.transactedAt)
  const dateLabel = `${d.getMonth() + 1}/${d.getDate()}`

  const inner = (
    <>
      <CategoryChip categoryId={tx.category} size={32} />
      <div className="flex-1 min-w-0 text-left">
        <div className="text-sm font-medium mb-0.5" style={{ color: 'var(--ink)' }}>
          {tx.description}
        </div>
        <div
          className="text-[11px] flex items-center gap-1.5"
          style={{ color: 'var(--ink-3)' }}
        >
          {dateLabel} · <Avatar who={payerIsViewer ? 'M' : 'T'} initial={payerInitial} size={12} /> {payerLabel}
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
          <div className="tnum text-[10px] mt-px" style={{ color: dColor }}>
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
