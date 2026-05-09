'use client'

import { getCategory } from '@/lib/categories'
import { useTranslations } from '@/lib/i18n/client'
import type { RecurringExpenseRuleRow } from '@/lib/db/queries/recurringExpense'

interface Props {
  rule: RecurringExpenseRuleRow
  onEdit: (rule: RecurringExpenseRuleRow) => void
}

export function RuleListItem({ rule, onEdit }: Props) {
  const t = useTranslations()
  const cat = getCategory(rule.category)
  const isPaused = !!rule.pausedAt

  const intervalLabel: Record<number, string> = {
    1: t.recurringExpense.rule.intervalEveryMonth,
    3: t.recurringExpense.rule.intervalEveryQuarter,
    6: t.recurringExpense.rule.intervalEveryHalfYear,
    12: t.recurringExpense.rule.intervalEveryYear,
  }
  const intervalText =
    intervalLabel[rule.intervalMonths] ??
    t.recurringExpense.rule.intervalEveryNMonths.replace('{n}', String(rule.intervalMonths))
  const dayText = t.recurringExpense.rule.dayLabel.replace('{day}', String(rule.dayOfMonth))

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
              {rule.description}
              {isPaused && (
                <span
                  className="ml-2 text-xs font-normal"
                  style={{ color: '#b45309' }}
                >
                  {t.recurringExpense.rule.pausedHint}
                </span>
              )}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
              {intervalText}
              {' · '}{dayText}
              {' · '}NT${rule.amount.toLocaleString()}
            </div>
          </div>
          <span className="text-sm flex-shrink-0" style={{ color: 'var(--ink-3)' }}>›</span>
        </div>
      </button>
    </li>
  )
}
