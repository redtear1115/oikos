'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { getIncomeCategory } from '@/lib/incomeCategories'
import { pauseRule, resumeRule } from '@/actions/recurringIncome'
import type { RecurringRuleRow } from '@/lib/db/queries/recurringIncome'

const INTERVAL_LABEL: Record<number, string> = { 1: '每月', 3: '每季', 6: '每半年', 12: '每年' }

export function RuleListItem({ rule }: { rule: RecurringRuleRow }) {
  const cat = getIncomeCategory(rule.category)
  const [pending, startTransition] = useTransition()
  const isPaused = !!rule.pausedAt

  return (
    <li
      className="rounded-2xl p-4"
      style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
    >
      <div className="flex items-start gap-3">
        <span
          className="grid h-9 w-9 place-items-center rounded-full text-[var(--fs-base)]"
          style={{ background: cat.tint, color: cat.ink }}
        >
          {cat.mono}
        </span>
        <div className="flex-1">
          <div className="text-[var(--fs-base)] font-medium" style={{ color: 'var(--ink)' }}>
            {rule.source ?? cat.label}
          </div>
          <div className="text-[var(--fs-sm)]" style={{ color: 'var(--ink-3)' }}>
            {INTERVAL_LABEL[rule.intervalMonths] ?? `每 ${rule.intervalMonths} 個月`} · {rule.dayOfMonth} 號 · NT$ {rule.amount.toLocaleString()}
          </div>
          {isPaused && (
            <div className="mt-1 text-[var(--fs-xs)]" style={{ color: '#b45309' }}>已暫停</div>
          )}
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <Link
          href={`/settings/recurring-income/${rule.id}`}
          className="flex-1 rounded-full py-2 text-center text-[var(--fs-sm)]"
          style={{ border: '1px solid var(--hairline)', color: 'var(--ink)' }}
        >
          編輯
        </Link>
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(async () => {
            if (isPaused) await resumeRule(rule.id)
            else await pauseRule(rule.id)
          })}
          className="flex-1 rounded-full py-2 text-[var(--fs-sm)] disabled:opacity-50"
          style={{ border: '1px solid var(--hairline)', color: 'var(--ink)' }}
        >
          {isPaused ? '恢復' : '暫停'}
        </button>
      </div>
    </li>
  )
}
