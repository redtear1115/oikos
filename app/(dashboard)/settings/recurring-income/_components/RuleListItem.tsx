'use client'

import { getIncomeCategory } from '@/lib/incomeCategories'
import { useTranslations } from '@/lib/i18n/client'
import { useMember, whoToMemberRole } from '@/app/(dashboard)/_components/MemberContext'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import type { RecurringRuleRow } from '@/lib/db/queries/recurringIncome'
import { formatAmount } from '@/lib/currency'

interface Props {
  rule: RecurringRuleRow
  onEdit: (rule: RecurringRuleRow) => void
}

export function RuleListItem({ rule, onEdit }: Props) {
  const t = useTranslations()
  const { viewer, partner, viewerIsA, isSolo } = useMember()
  const cat = getIncomeCategory(rule.category)
  const isPaused = !!rule.pausedAt

  const recipientIsViewer = rule.recipientId === viewer.id
  const recipientRole = whoToMemberRole(recipientIsViewer ? 'M' : 'T', viewerIsA)
  const recipientInitial = recipientIsViewer ? viewer.initial : (partner?.initial ?? '?')
  const recipientAvatar = recipientIsViewer ? viewer.avatarUrl : (partner?.avatarUrl ?? null)
  const recipientName = recipientIsViewer ? t.common.you : (partner?.displayName ?? t.common.partner)

  const intervalLabel: Record<number, string> = {
    1: t.recurringIncome.rule.intervalEveryMonth,
    3: t.recurringIncome.rule.intervalEveryQuarter,
    6: t.recurringIncome.rule.intervalEveryHalfYear,
    12: t.recurringIncome.rule.intervalEveryYear,
  }
  const intervalText =
    intervalLabel[rule.intervalMonths] ??
    t.recurringIncome.rule.intervalEveryNMonths.replace('{n}', String(rule.intervalMonths))
  const dayText = t.recurringIncome.rule.dayLabel.replace('{day}', String(rule.dayOfMonth))

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
            <div className="flex items-center gap-2 min-w-0">
              <div className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>
                {rule.source ?? cat.label}
              </div>
              {isPaused && (
                <span
                  className="shrink-0 inline-flex items-center px-2 py-[1px] rounded-full text-micro font-medium leading-none"
                  style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}
                >
                  {t.recurringIncome.rule.pausedHint}
                </span>
              )}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
              {intervalText}
              {' · '}{dayText}
              {' · '}{formatAmount(rule.amount, 'twd')}
            </div>
            {!isSolo && (
              <div
                className="text-xs mt-1 flex items-center gap-1.5 flex-wrap"
                style={{ color: 'var(--ink-3)' }}
              >
                <Avatar memberRole={recipientRole} initial={recipientInitial} src={recipientAvatar} size={16} />
                <span className="truncate">{recipientName}</span>
              </div>
            )}
          </div>
          <span className="text-sm flex-shrink-0" style={{ color: 'var(--ink-3)' }} aria-hidden="true">›</span>
        </div>
      </button>
    </li>
  )
}
