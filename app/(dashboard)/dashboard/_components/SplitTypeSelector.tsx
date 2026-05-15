'use client'

import type { SplitType } from '@/lib/balance'
import { SplitGlyph } from './SplitGlyph'
import { formatAmount } from '@/lib/currency'

interface SplitTypeSelectorProps {
  value: SplitType
  splitRatioA: number            // 1–99; only meaningful when value = 'weighted' or 'half'
  onSplitRatioAChange: (r: number) => void
  onChange: (split: SplitType) => void
  amount: number
  payerWho: 'M' | 'T'
}

function weightedSub(payerWho: 'M' | 'T', amount: number, ratioA: number): string {
  const otherShare = 100 - ratioA
  const myShare = ratioA
  if (ratioA === 50) {
    if (!amount) return '各付一半'
    const half = Math.ceil(amount / 2)
    return payerWho === 'M'
      ? `對方欠你 ${formatAmount(half, 'twd')}`
      : `你欠對方 ${formatAmount(half, 'twd')}`
  }
  if (!amount) return `我 ${ratioA}%・對方 ${otherShare}%`
  const otherOwed = Math.ceil(amount * otherShare / 100)
  const myOwed = Math.ceil(amount * myShare / 100)
  return payerWho === 'M'
    ? `對方欠你 ${formatAmount(otherOwed, 'twd')}`
    : `你欠對方 ${formatAmount(myOwed, 'twd')}`
}

function splitSub(splitId: 'all_mine' | 'all_theirs', payerWho: 'M' | 'T', amount: number): string {
  if (splitId === 'all_mine') {
    return payerWho === 'M' ? '你自己花的，不會欠款' : '對方自己花的，不會欠款'
  }
  if (!amount) return payerWho === 'M' ? '對方欠你全額' : '你欠對方全額'
  return payerWho === 'M'
    ? `對方欠你 ${formatAmount(amount, 'twd')}`
    : `你欠對方 ${formatAmount(amount, 'twd')}`
}

export function SplitTypeSelector({ value, splitRatioA, onSplitRatioAChange, onChange, amount, payerWho }: SplitTypeSelectorProps) {
  const weightedLabel = splitRatioA === 50 ? '平分' : '依比例分'
  const isWeighted = value === 'weighted' || value === 'half'

  const staticOptions = [
    { id: 'all_mine'   as const, label: '全部我的',   sub: splitSub('all_mine',   payerWho, amount) },
    { id: 'all_theirs' as const, label: '全部對方的', sub: splitSub('all_theirs', payerWho, amount) },
  ]

  return (
    <div role="radiogroup" aria-label="分擔方式" className="flex flex-col gap-2">
      {/* Weighted option (replaces half). The card wraps a radio button + an
          optional sibling slider — keeps the same visual but flattens the
          previously nested button > range into siblings (issue #385). */}
      <div
        className="flex flex-col gap-2 px-3.5 py-3 rounded-[14px]"
        style={{
          background: 'var(--surface)',
          border: isWeighted ? '1.5px solid var(--ink)' : '1px solid var(--hairline)',
        }}
      >
        <button
          type="button"
          role="radio"
          aria-checked={isWeighted}
          onClick={() => onChange('weighted')}
          className="flex items-center gap-3 w-full text-left bg-transparent border-0 p-0 cursor-pointer transition-all duration-150"
        >
          <SplitGlyph kind="weighted" active={isWeighted} ratioA={splitRatioA} />
          <div className="flex-1">
            <div className="text-body font-medium tracking-tight" style={{ color: 'var(--ink)' }}>
              {weightedLabel}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
              {weightedSub(payerWho, amount, splitRatioA)}
            </div>
          </div>
          <div className="w-5 h-5 rounded-full transition-all duration-150"
            style={{
              border: isWeighted ? '6px solid var(--ink)' : '1.5px solid var(--hairline)',
              background: isWeighted ? 'var(--ink)' : 'transparent',
              boxShadow: isWeighted ? 'inset 0 0 0 3px var(--surface)' : 'none',
            }} />
        </button>
        {isWeighted && (
          <div className="flex flex-col gap-1 pt-1 w-full">
            <div className="flex justify-between text-xs w-full" style={{ color: 'var(--ink-3)' }}>
              <span>我 {splitRatioA}%</span>
              <span>對方 {100 - splitRatioA}%</span>
            </div>
            <input
              type="range"
              min={1}
              max={99}
              step={1}
              value={splitRatioA}
              onChange={e => onSplitRatioAChange(Number(e.target.value))}
              aria-label="分擔比例"
              className="w-full accent-[var(--ink)]"
            />
          </div>
        )}
      </div>

      {/* Static options */}
      {staticOptions.map(s => {
        const sel = value === s.id
        return (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={sel}
            onClick={() => onChange(s.id)}
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
