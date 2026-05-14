'use client'

import { INCOME_PALETTES } from '@/lib/incomePalettes'
import type { SavingsProgress } from '@/lib/insuranceProgress'
import { useLocale, useTranslations } from '@/lib/i18n/client'
import type { Translations } from '@/lib/i18n/locales/zh-TW'
import { SAVINGS_RETURN_CATEGORIES, getIncomeCategory } from '@/lib/incomeCategories'
import { formatDateAbsolute } from '@/lib/format-date'

interface Props {
  progress: SavingsProgress
  endsAt: string | null
  startsAt: string | null
  /** v0.15.0 #132 — per-category amount across SAVINGS_RETURN_CATEGORIES.
   *  When ≥ 2 buckets are non-zero, we render a breakdown sub-line
   *  beneath the「出」progress bar. */
  returnBreakdown?: Record<string, number>
  onSetExpectedMaturity?: () => void
}

export function SavingsHero({ progress, endsAt, startsAt, returnBreakdown, onSetExpectedMaturity }: Props) {
  const t = useTranslations()
  const locale = useLocale()
  const ts = t.assetDetail.savings
  const hasExpected = progress.expectedMaturity !== null
  const subCopy = computeSub(progress, endsAt, startsAt, ts, locale)

  // Breakdown row: only render when at least two buckets carry money. A
  // single non-zero bucket already tells the full story via the main bar.
  const breakdownParts = SAVINGS_RETURN_CATEGORIES
    .map((cat) => ({ cat, amount: returnBreakdown?.[cat] ?? 0 }))
    .filter((p) => p.amount > 0)
  const showBreakdown = breakdownParts.length >= 2

  return (
    <div className="px-5 pt-5 pb-6" style={{ background: '#F7F4EE' }}>
      <ProgressBar
        label={ts.heroLabelIn}
        progress={progress.payProgress}
        actual={progress.premiumTotal}
        expected={progress.expectedTotalPayment}
        accent={INCOME_PALETTES.mint.ink}
        actualLabel={ts.heroPaymentLabel}
        expectedTag={ts.heroExpectedTag}
      />

      <div className="h-3" />

      {hasExpected ? (
        <ProgressBar
          label={ts.heroLabelOut}
          progress={progress.returnProgress}
          actual={progress.returnTotal}
          expected={progress.expectedMaturity}
          accent={INCOME_PALETTES.gold.ink}
          actualLabel={ts.heroReturnLabel}
          expectedTag={ts.heroExpectedTag}
        />
      ) : (
        <NoExpectedMaturityRow
          received={progress.returnTotal}
          onSetExpected={onSetExpectedMaturity}
          labelOut={ts.heroLabelOut}
          barTemplate={ts.heroNoExpectedBar}
          ctaLabel={ts.heroNoExpectedCta}
        />
      )}

      {showBreakdown && (
        <div
          className="mt-1.5 ml-[26px] text-xs tabular-nums"
          style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}
        >
          {ts.heroBreakdownPrefix}{' '}
          {/* TODO(v0.17 currency): "NT$ {amount}" with space + i18n templates have
               "NT$" baked in (heroMatured, savings*, etc.) — defer until formatAmount
               gains digits-only mode. */}
          {breakdownParts.map((p, idx) => (
            <span key={p.cat}>
              {idx > 0 && ' · '}
              {getIncomeCategory(p.cat).label} NT$ {p.amount.toLocaleString()}
            </span>
          ))}
        </div>
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
  expectedTag,
}: {
  label: string
  progress: number | null
  actual: number
  expected: number | null
  accent: string
  actualLabel: string
  expectedTag: string
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
          <span> / {expectedTag} NT$ {expected.toLocaleString()}</span>
        )}
      </div>
    </div>
  )
}

function NoExpectedMaturityRow({
  received,
  onSetExpected,
  labelOut,
  barTemplate,
  ctaLabel,
}: {
  received: number
  onSetExpected?: () => void
  labelOut: string
  barTemplate: string
  ctaLabel: string
}) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <span
          className="text-base font-semibold shrink-0"
          style={{ color: 'var(--ink-2)', fontFamily: 'var(--font-numeric)', width: 18 }}
        >
          {labelOut}
        </span>
        <div className="flex-1 text-xs" style={{ color: 'var(--ink-2)', fontFamily: 'var(--font-numeric)' }}>
          {barTemplate.replace('{received}', received.toLocaleString())}
        </div>
      </div>
      {onSetExpected && (
        <button
          type="button"
          onClick={onSetExpected}
          className="mt-1.5 ml-[26px] text-xs underline-offset-2 underline"
          style={{ color: 'var(--ink-2)' }}
        >
          {ctaLabel}
        </button>
      )}
    </div>
  )
}

function computeSub(p: SavingsProgress, endsAt: string | null, startsAt: string | null, ts: Translations['assetDetail']['savings'], locale: string): string {
  if (p.awaitingMaturity) return ts.heroAwaitingMaturity
  // Not yet active: only when we have a start date and we're before it
  if (startsAt && p.timeProgress === 0) return ts.heroNotYetActive.replace('{date}', formatDateAbsolute(startsAt, locale))
  if (p.returnTotal === 0) {
    return endsAt
      ? ts.heroNotStartedWithDate.replace('{date}', formatDateAbsolute(endsAt, locale))
      : ts.heroNotStarted
  }
  if (p.returnRatio !== null && p.returnRatio < 1 && p.returnProgress !== null) {
    const pct = String(Math.round(p.returnProgress * 100))
    return p.yearsLeft !== null && p.yearsLeft > 0
      ? ts.heroPartialWithYears.replace('{pct}', pct).replace('{years}', p.yearsLeft.toFixed(1))
      : ts.heroPartial.replace('{pct}', pct)
  }
  return ts.heroMatured.replace('{total}', p.returnTotal.toLocaleString())
}
