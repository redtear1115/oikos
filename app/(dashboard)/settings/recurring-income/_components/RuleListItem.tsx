'use client'

import { getIncomeCategory } from '@/lib/incomeCategories'
import type { RecurringRuleRow } from '@/lib/db/queries/recurringIncome'

const INTERVAL_LABEL: Record<number, string> = { 1: '每月', 3: '每季', 6: '每半年', 12: '每年' }

interface Props {
  rule: RecurringRuleRow
  onEdit: (rule: RecurringRuleRow) => void
}

export function RuleListItem({ rule, onEdit }: Props) {
  const cat = getIncomeCategory(rule.category)
  const isPaused = !!rule.pausedAt

  return (
    <li>
      <button
        type="button"
        onClick={() => onEdit(rule)}
        className="w-full text-left relative overflow-hidden rounded-2xl p-4 cursor-pointer"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--hairline)',
          opacity: isPaused ? 0.65 : 1,
          fontFamily: 'inherit',
        }}
      >
        {/* Paused indicator bar */}
        {isPaused && (
          <span
            aria-hidden="true"
            className="absolute left-0 top-0 h-full"
            style={{ width: 4, background: 'var(--ink-3)', borderRadius: '12px 0 0 12px' }}
          />
        )}

        <div className="flex items-center gap-3">
          <span
            className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-base"
            style={{ background: cat.tint, color: cat.ink }}
          >
            {cat.mono}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>
              {rule.source ?? cat.label}
              {isPaused && (
                <span
                  className="ml-2 text-xs font-normal"
                  style={{ color: '#b45309' }}
                >
                  已暫停
                </span>
              )}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
              {INTERVAL_LABEL[rule.intervalMonths] ?? `每 ${rule.intervalMonths} 個月`}
              {' · '}{rule.dayOfMonth} 號
              {' · '}NT${rule.amount.toLocaleString()}
            </div>
          </div>
          <span className="text-sm flex-shrink-0" style={{ color: 'var(--ink-3)' }}>›</span>
        </div>
      </button>
    </li>
  )
}
