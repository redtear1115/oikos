'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RuleListItem } from './RuleListItem'
import { RecurringRuleSheet } from './RecurringRuleSheet'
import { DEFAULT_INCOME_PALETTE } from '@/lib/incomePalettes'
import { useTranslations } from '@/lib/i18n/client'
import type { RecurringRuleRow } from '@/lib/db/queries/recurringIncome'

const P = DEFAULT_INCOME_PALETTE

interface Props {
  rules: RecurringRuleRow[]
  insuranceAssets: { id: string; name: string }[]
}

export function RecurringIncomeContent({ rules, insuranceAssets }: Props) {
  const router = useRouter()
  const t = useTranslations()
  // null = closed, 'create' = new rule sheet, RecurringRuleRow = edit sheet
  const [sheetState, setSheetState] = useState<null | 'create' | RecurringRuleRow>(null)

  const isOpen = sheetState !== null
  const initial = typeof sheetState === 'object' && sheetState !== null ? sheetState : undefined

  const handleMutated = () => {
    setSheetState(null)
    router.refresh()
  }

  return (
    <>
      {/* Page header */}
      <div
        className="px-4 flex items-center justify-between"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 24px)', paddingBottom: 8 }}
      >
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1.5 bg-transparent border-0 cursor-pointer p-1 -ml-1"
          style={{ color: 'var(--ink-2)', fontFamily: 'inherit', fontSize: 'var(--fs-sm)' }}
        >
          <svg width="8" height="13" viewBox="0 0 8 13" fill="none" aria-hidden="true">
            <path d="M7 1L1 6.5L7 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t.recurringIncome.back}
        </button>

        <div className="text-base font-semibold" style={{ color: 'var(--ink)' }}>
          {t.recurringIncome.title}
        </div>

        <button
          type="button"
          onClick={() => setSheetState('create')}
          className="rounded-full px-3.5 py-1.5 text-sm font-medium text-white border-0 cursor-pointer"
          style={{ background: 'var(--ink)' }}
        >
          {t.recurringIncome.add}
        </button>
      </div>

      {/* Rules list or empty state */}
      <div className="px-4 mt-4">
        {rules.length === 0 ? (
          <EmptyState
            hint={t.recurringIncome.empty.hint}
            cta={t.recurringIncome.empty.cta}
            onAdd={() => setSheetState('create')}
          />
        ) : (
          <ul className="space-y-3">
            {rules.map((r) => (
              <RuleListItem
                key={r.id}
                rule={r}
                onEdit={(rule) => setSheetState(rule)}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Sheet */}
      <RecurringRuleSheet
        open={isOpen}
        onClose={() => setSheetState(null)}
        onMutated={handleMutated}
        initial={initial}
        insuranceAssets={insuranceAssets}
      />
    </>
  )
}

function EmptyState({ hint, cta, onAdd }: { hint: string; cta: string; onAdd: () => void }) {
  const dots = [
    { x: 22, y: 18, r: 1.6, o: 0.30 }, { x: 78, y: 14, r: 2.2, o: 0.22 },
    { x: 12, y: 38, r: 1.2, o: 0.18 }, { x: 90, y: 30, r: 1.8, o: 0.28 },
    { x: 32, y: 60, r: 2.4, o: 0.32 }, { x: 70, y: 64, r: 1.5, o: 0.20 },
    { x: 18, y: 78, r: 1.8, o: 0.24 }, { x: 82, y: 82, r: 1.2, o: 0.18 },
    { x: 50, y: 25, r: 1.4, o: 0.22 }, { x: 60, y: 88, r: 2.0, o: 0.26 },
  ]

  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <div style={{ position: 'relative', width: '100%', height: 160, marginBottom: 20 }}>
        <svg
          width="100%" height="160" viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0 }}
        >
          {dots.map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={P.ink} opacity={d.o} />
          ))}
          <circle cx="50" cy="50" r="12" fill={P.glow} opacity="0.6" />
          <circle cx="50" cy="50" r="8" fill={P.glow} opacity="0.4" />
          <circle cx="50" cy="50" r="5" fill={P.ink} opacity="0.25" />
          <circle cx="50" cy="50" r="2" fill={P.ink} opacity="0.7" />
        </svg>
      </div>
      <p className="mb-5 text-sm" style={{ color: 'var(--ink-2)', lineHeight: 1.6 }}>
        {hint}
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="h-10 px-6 rounded-full text-sm font-semibold inline-flex items-center border-0 cursor-pointer"
        style={{ background: P.tint, color: P.ink, border: `1px solid ${P.ink}30` }}
      >
        {cta}
      </button>
    </div>
  )
}
