'use client'

import type { SplitType } from '@/lib/balance'
import { SplitGlyph } from './SplitGlyph'
import { formatAmount } from '@/lib/currency'
import { useTranslations } from '@/lib/i18n/client'
import type { Translations } from '@/lib/i18n/locales/zh-TW'

interface SplitTypeSelectorProps {
  value: SplitType
  splitRatioA: number            // 1–99; only meaningful when value = 'weighted' or 'half'
  onSplitRatioAChange: (r: number) => void
  onChange: (split: SplitType) => void
  amount: number
  payerWho: 'M' | 'T'
  /**
   * The group's default split shown in the viewer's angle (already passed
   * through `toViewerShare` by the caller). Drives the "reset to default"
   * affordance: when the slider has drifted off this value, a small button
   * lets the user snap back to it (#902).
   */
  defaultViewerShare: number
}

type STS = Translations['splitTypeSelector']

function weightedSub(sts: STS, payerWho: 'M' | 'T', amount: number, ratioA: number): string {
  const otherShare = 100 - ratioA
  const myShare = ratioA
  if (ratioA === 50) {
    if (!amount) return sts.evenSub
    const half = Math.ceil(amount / 2)
    return payerWho === 'M'
      ? sts.partnerOwesYouAmount.replace('{amount}', formatAmount(half, 'twd'))
      : sts.youOwePartnerAmount.replace('{amount}', formatAmount(half, 'twd'))
  }
  if (!amount) return sts.ratioNoAmount.replace('{me}', String(ratioA)).replace('{other}', String(otherShare))
  const otherOwed = Math.ceil(amount * otherShare / 100)
  const myOwed = Math.ceil(amount * myShare / 100)
  return payerWho === 'M'
    ? sts.partnerOwesYouAmount.replace('{amount}', formatAmount(otherOwed, 'twd'))
    : sts.youOwePartnerAmount.replace('{amount}', formatAmount(myOwed, 'twd'))
}

function splitSub(sts: STS, splitId: 'all_mine' | 'all_theirs', payerWho: 'M' | 'T', amount: number): string {
  if (splitId === 'all_mine') {
    return payerWho === 'M' ? sts.allMineSelfPaid : sts.allMinePartnerPaid
  }
  if (!amount) return payerWho === 'M' ? sts.allTheirsNoAmount : sts.allTheirsPartnerNoAmount
  return payerWho === 'M'
    ? sts.allTheirsYouPaid.replace('{amount}', formatAmount(amount, 'twd'))
    : sts.allTheirsPartnerPaid.replace('{amount}', formatAmount(amount, 'twd'))
}

export function SplitTypeSelector({ value, splitRatioA, onSplitRatioAChange, onChange, amount, payerWho, defaultViewerShare }: SplitTypeSelectorProps) {
  const t = useTranslations()
  const sts = t.splitTypeSelector
  const weightedLabel = splitRatioA === 50 ? t.splitType.even : t.splitType.weighted
  const isWeighted = value === 'weighted' || value === 'half'
  const hasDriftedFromDefault = splitRatioA !== defaultViewerShare

  const staticOptions = [
    { id: 'all_mine'   as const, label: t.splitType.allMine,     sub: splitSub(sts, 'all_mine',   payerWho, amount) },
    { id: 'all_theirs' as const, label: t.splitType.allPartners, sub: splitSub(sts, 'all_theirs', payerWho, amount) },
  ]

  return (
    <div role="radiogroup" aria-label={sts.groupAriaLabel} className="flex flex-col gap-2">
      {/* Weighted option (replaces half). The card wraps a radio button + an
          optional sibling slider — keeps the same visual but flattens the
          previously nested button > range into siblings (issue #385). */}
      <div
        className="flex flex-col gap-2 px-3.5 py-3 rounded-bubble"
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
            <div className="text-base font-medium tracking-tight" style={{ color: 'var(--ink)' }}>
              {weightedLabel}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
              {weightedSub(sts, payerWho, amount, splitRatioA)}
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
              <span>{sts.meRatio.replace('{ratio}', String(splitRatioA))}</span>
              <span>{sts.partnerRatio.replace('{ratio}', String(100 - splitRatioA))}</span>
            </div>
            <input
              type="range"
              min={1}
              max={99}
              step={1}
              value={splitRatioA}
              onChange={e => onSplitRatioAChange(Number(e.target.value))}
              aria-label={sts.ratioAriaLabel}
              className="w-full accent-[var(--ink)]"
            />
            {hasDriftedFromDefault && (
              <button
                type="button"
                onClick={() => onSplitRatioAChange(defaultViewerShare)}
                className="self-end text-xs underline underline-offset-2 mt-0.5 px-1 py-0.5 bg-transparent border-0 cursor-pointer transition-colors duration-150"
                style={{ color: 'var(--ink-3)' }}
              >
                {sts.resetToDefault}
              </button>
            )}
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
            className="flex items-center gap-3 px-3.5 py-3 rounded-bubble cursor-pointer text-left transition-all duration-150"
            style={{
              background: 'var(--surface)',
              border: sel ? '1.5px solid var(--ink)' : '1px solid var(--hairline)',
            }}>
            <SplitGlyph kind={s.id} active={sel} />
            <div className="flex-1">
              <div className="text-base font-medium tracking-tight" style={{ color: 'var(--ink)' }}>
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
