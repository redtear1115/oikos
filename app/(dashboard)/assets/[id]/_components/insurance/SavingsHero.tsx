'use client'

import { INCOME_PALETTES } from '@/lib/incomePalettes'
import type { SavingsProgress } from '@/lib/insuranceProgress'
import { SAVINGS_HERO_SUB, SAVINGS_NO_EXPECTED_MATURITY } from './insurance-copy'

interface Props {
  progress: SavingsProgress
  endsAt: string | null
  startsAt: string | null
  onSetExpectedMaturity?: () => void
}

export function SavingsHero({ progress, endsAt, startsAt, onSetExpectedMaturity }: Props) {
  const hasExpected = progress.expectedMaturity !== null
  const subCopy = computeSub(progress, endsAt, startsAt)

  return (
    <div className="px-5 pt-5 pb-6" style={{ background: '#F7F4EE' }}>
      <ProgressBar
        label="入"
        progress={progress.payProgress}
        actual={progress.premiumTotal}
        expected={progress.expectedTotalPayment}
        accent={INCOME_PALETTES.mint.ink}
        actualLabel="累計繳"
      />

      <div className="h-3" />

      {hasExpected ? (
        <ProgressBar
          label="出"
          progress={progress.returnProgress}
          actual={progress.returnTotal}
          expected={progress.expectedMaturity}
          accent={INCOME_PALETTES.gold.ink}
          actualLabel="已拿回"
        />
      ) : (
        <NoExpectedMaturityRow
          received={progress.returnTotal}
          onSetExpected={onSetExpectedMaturity}
        />
      )}

      <div className="mt-4 text-[14px]" style={{ color: 'var(--ink-3)', fontStyle: 'italic' }}>
        {subCopy}
      </div>
    </div>
  )
}

function ProgressBar({
  label,
  progress,
  actual,
  expected,
  accent,
  actualLabel,
}: {
  label: string
  progress: number | null
  actual: number
  expected: number | null
  accent: string
  actualLabel: string
}) {
  const pct = progress !== null ? Math.round(progress * 100) : null
  return (
    <div>
      <div className="flex items-center gap-3">
        <span
          className="text-base font-semibold shrink-0"
          style={{ color: 'var(--ink-2)', fontFamily: 'var(--font-numeric)', width: 18 }}
        >
          {label}
        </span>
        <div
          className="flex-1 h-2.5 rounded-full overflow-hidden"
          style={{ background: 'rgba(58,36,25,0.08)' }}
        >
          {progress !== null && (
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%`, background: accent }}
            />
          )}
        </div>
        <span
          className="shrink-0 text-xs tabular-nums"
          style={{ color: 'var(--ink-2)', fontFamily: 'var(--font-numeric)', minWidth: 40, textAlign: 'right' }}
        >
          {pct !== null ? `${pct}%` : '—'}
        </span>
      </div>
      <div className="mt-1.5 ml-[26px] text-xs tabular-nums" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>
        <span style={{ color: 'var(--ink) ' }}>NT$ {actual.toLocaleString()}</span>
        <span> {actualLabel}</span>
        {expected !== null && (
          <span> / 估 NT$ {expected.toLocaleString()}</span>
        )}
      </div>
    </div>
  )
}

function NoExpectedMaturityRow({ received, onSetExpected }: { received: number; onSetExpected?: () => void }) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <span
          className="text-base font-semibold shrink-0"
          style={{ color: 'var(--ink-2)', fontFamily: 'var(--font-numeric)', width: 18 }}
        >
          出
        </span>
        <div className="flex-1 text-xs" style={{ color: 'var(--ink-2)', fontFamily: 'var(--font-numeric)' }}>
          {SAVINGS_NO_EXPECTED_MATURITY.bar(received)}
        </div>
      </div>
      {onSetExpected && (
        <button
          type="button"
          onClick={onSetExpected}
          className="mt-1.5 ml-[26px] text-xs underline-offset-2 underline"
          style={{ color: 'var(--ink-2)' }}
        >
          {SAVINGS_NO_EXPECTED_MATURITY.ctaLabel}
        </button>
      )}
    </div>
  )
}

function computeSub(p: SavingsProgress, endsAt: string | null, startsAt: string | null): string {
  if (p.awaitingMaturity) return SAVINGS_HERO_SUB.awaitingMaturity()
  // Not yet active: only when we have a start date and we're before it
  if (startsAt && p.timeProgress === 0) return SAVINGS_HERO_SUB.notYetActive(startsAt)
  if (p.returnTotal === 0) return SAVINGS_HERO_SUB.notStarted(endsAt)
  if (p.returnRatio !== null && p.returnRatio < 1 && p.returnProgress !== null) {
    return SAVINGS_HERO_SUB.partial(Math.round(p.returnProgress * 100), p.yearsLeft)
  }
  return SAVINGS_HERO_SUB.matured(p.returnTotal)
}
