'use client'

import type { SplitType } from '@/lib/balance'
import { SplitGlyph } from './SplitGlyph'

interface SplitTypeSelectorProps {
  value: SplitType
  onChange: (split: SplitType) => void
  amount: number      // parsed integer for subtitle calculation
  payerWho: 'M' | 'T'  // for subtitle perspective
}

function splitSub(splitId: SplitType, payerWho: 'M' | 'T', amount: number): string {
  if (splitId === 'all_mine') {
    return payerWho === 'M' ? '你自己花的，不會欠款' : '對方自己花的，不會欠款'
  }
  if (splitId === 'all_theirs') {
    if (!amount) return payerWho === 'M' ? '對方欠你全額' : '你欠對方全額'
    return payerWho === 'M'
      ? `對方欠你 NT$${amount.toLocaleString('en-US')}`
      : `你欠對方 NT$${amount.toLocaleString('en-US')}`
  }
  // half
  if (!amount) return '各付一半'
  const half = Math.ceil(amount / 2)
  return payerWho === 'M'
    ? `對方欠你 NT$${half.toLocaleString('en-US')}`
    : `你欠對方 NT$${half.toLocaleString('en-US')}`
}

export function SplitTypeSelector({ value, onChange, amount, payerWho }: SplitTypeSelectorProps) {
  return (
    <div className="flex flex-col gap-2">
      {([
        { id: 'all_mine',   label: '全部我的',   sub: splitSub('all_mine',   payerWho, amount) },
        { id: 'all_theirs', label: '全部對方的', sub: splitSub('all_theirs', payerWho, amount) },
        { id: 'half',       label: '平分',       sub: splitSub('half',       payerWho, amount) },
      ] as const).map(s => {
        const sel = value === s.id
        return (
          <button key={s.id} onClick={() => onChange(s.id)}
            className="flex items-center gap-3 px-3.5 py-3 rounded-[14px] cursor-pointer text-left transition-all duration-150"
            style={{
              background: 'var(--surface)',
              border: sel ? '1.5px solid var(--ink)' : '1px solid var(--hairline)',
            }}>
            <SplitGlyph kind={s.id} active={sel} />
            <div className="flex-1">
              <div className="text-body font-medium tracking-tight" style={{ color: 'var(--ink)' }}>
                {s.label}
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>{s.sub}</div>
            </div>
            <div className="w-5 h-5 rounded-full transition-all duration-150"
              style={{
                border: sel ? '6px solid var(--ink)' : '1.5px solid var(--hairline)',
                background: sel ? 'var(--ink)' : 'transparent',
                boxShadow: sel ? 'inset 0 0 0 3px var(--surface)' : 'none',
              }} />
          </button>
        )
      })}
    </div>
  )
}
