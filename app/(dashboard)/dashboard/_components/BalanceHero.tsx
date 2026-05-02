'use client'

import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { PlusIcon } from '@/app/(dashboard)/_components/PlusIcon'
import { viewerBalance } from '@/lib/balance'

interface Props {
  rawBalance: number  // member_a perspective (positive = b owes a)
  onAddClick: () => void
  onSettleClick: () => void
}

export function BalanceHero({ rawBalance, onAddClick, onSettleClick }: Props) {
  const { viewer, partner, viewerIsA } = useMember()
  const balance = viewerBalance(rawBalance, viewerIsA)
  // balance > 0 → 對方欠你; balance < 0 → 你欠對方; balance == 0 → 打平

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

  return (
    <div className="px-5 pt-6 pb-5">
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
      </div>

      <div className="flex gap-2 mt-[18px]">
        <button onClick={onAddClick}
          className="flex-1 h-[46px] rounded-xl border-0 text-white font-semibold text-sm tracking-[0.3px] cursor-pointer flex items-center justify-center gap-1.5"
          style={{ background: 'var(--ink)' }}>
          <PlusIcon size={16} />新增一筆
        </button>
        <button onClick={onSettleClick}
          disabled
          title="Phase 1c"
          className="h-[46px] px-4 rounded-xl text-sm font-medium cursor-not-allowed opacity-60"
          style={{
            background: 'var(--surface)',
            color: 'var(--ink)',
            border: '1px solid var(--hairline)',
          }}>結算</button>
      </div>
    </div>
  )
}
