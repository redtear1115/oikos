'use client'

import type { Age } from '@/lib/age'
import { formatAmount } from '@/lib/currency'
import { useTranslations } from '@/lib/i18n/client'

export function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 pt-[18px] pb-2">
      <div
        className="text-xs tracking-[1.5px] uppercase text-ink-3 font-numeric"
      >{children}</div>
    </div>
  )
}

export function InfoCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mx-4 rounded-2xl overflow-hidden bg-surface border border-hairline"
    >{children}</div>
  )
}

export function InfoRow({ label, value, mono = false, last = false }: {
  label: string; value: string; mono?: boolean; last?: boolean
}) {
  return (
    <div
      className="px-3.5 py-3 flex items-center gap-2.5"
      style={{ borderBottom: last ? 'none' : '1px solid var(--hairline)' }}
    >
      <div
        className="text-xs shrink-0 tracking-[0.4px] text-ink-3 w-19"
      >{label}</div>
      <div
        className="flex-1 text-sm font-medium truncate text-ink"
        style={{
          fontFamily: mono ? 'var(--font-numeric)' : 'inherit',
        }}
      >{value || '—'}</div>
    </div>
  )
}

// #1338 — this used to be `MoneyTwoCol`: a framed two-column block (本月 /
// 累計) sitting directly under the age hero, its labels in the 愛物's accent
// colour, louder than the numbers themselves. The list card above it already
// folded money into one quiet line (#1323); the detail page now carries the
// same shape down, so the first thing the page says stays 「這是我們照顧的一個
// 對象」 rather than 「這是一個成本中心」.
//
// Hidden entirely at 0 — a quiet 0 still asks the reader to notice its absence.
// In a past chapter 「本月」 is 0 by construction (the query scopes both
// aggregates to the chapter), so the label swaps to 「這個章節」 and shows the
// chapter total instead.
export function MoneyLine({ month, total, isPast }: { month: number; total: number; isPast: boolean }) {
  const t = useTranslations()
  const amount = isPast ? total : month
  if (amount === 0) return null
  const label = isPast ? t.assetDetail.money.thisChapter : t.assetDetail.money.thisMonth
  return (
    <div className="tnum text-xs px-5 pt-3 text-ink-3">
      {label} {formatAmount(amount, 'twd')}
    </div>
  )
}

// #1339 — takes an already-computed `Age` rather than the raw 'YYYY-MM-DD'
// string. It used to parse `new Date(birth)` (UTC) against a local `new Date()`
// and had no future-date guard, so a due date typed in ahead of the birth read
// as 「-1 歲」 here while the list card correctly showed no age. The single
// source of truth is now `computeAge()` in `lib/age.ts`; callers that get null
// back render no age block at all.
export function AgeDisplay({ age, accent }: { age: Age; accent: string }) {
  const t = useTranslations()
  const { years: yrs, months: mos } = age
  return (
    <div className="text-center">
      <div className="text-xs tracking-[1.5px] uppercase font-numeric" style={{ color: accent }}>{t.assetDetail.age.label}</div>
      <div className="inline-flex items-baseline gap-1 mt-1">
        <span className="tabular-nums leading-none text-amount-md font-numeric font-medium text-ink" style={{ letterSpacing: -1 }}>
          {yrs}
        </span>
        <span className="text-xs font-medium" style={{ color: accent }}>{t.assetDetail.age.yearsSuffix}</span>
        {mos > 0 && (
          <>
            <span className="tabular-nums leading-none ml-1 text-title font-numeric font-medium text-ink">
              {mos}
            </span>
            <span className="text-xs font-medium" style={{ color: accent }}>{t.assetDetail.age.monthsSuffix}</span>
          </>
        )}
      </div>
    </div>
  )
}
