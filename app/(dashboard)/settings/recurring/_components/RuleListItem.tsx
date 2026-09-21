'use client'

import { getCategory } from '@/lib/categories'
import { getIncomeCategory } from '@/lib/incomeCategories'
import { useLocale, useTranslations } from '@/lib/i18n/client'
import { ruleNextDateText } from '@/lib/recurringNextDate'
import { useMember, whoToMemberRole } from '@/app/(dashboard)/_components/MemberContext'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import type { RecurringExpenseRuleRow } from '@/lib/db/queries/recurringExpense'
import type { RecurringRuleRow } from '@/lib/db/queries/recurringIncome'
import type { SplitType } from '@/lib/balance'
import { formatAmount } from '@/lib/currency'

// One list row for both rule lists. The two used to be separate copies, and
// the income one drifted (raw zh-TW category label, #1189). Income has no
// split pill on purpose — a recipient is a single choice, not a split (#1187).
type Props =
  | { type: 'expense'; rule: RecurringExpenseRuleRow; onEdit: (rule: RecurringExpenseRuleRow) => void }
  | { type: 'income'; rule: RecurringRuleRow; onEdit: (rule: RecurringRuleRow) => void }

function splitLabel(
  split: SplitType,
  payerIsViewer: boolean,
  t: ReturnType<typeof useTranslations>,
): string {
  switch (split) {
    case 'half':       return t.splitType.even
    case 'all_mine':   return payerIsViewer ? t.splitType.allMine : t.splitType.allPartners
    case 'all_theirs': return payerIsViewer ? t.splitType.allPartners : t.splitType.allMine
    case 'weighted':   return t.splitType.weighted
  }
}

export function RuleListItem(props: Props) {
  const t = useTranslations()
  const locale = useLocale()
  const { viewer, partner, viewerIsA, isSolo } = useMember()
  const { rule } = props

  let cat: { tint: string; ink: string; mono: string }
  let title: string
  let personId: string
  let tRule: typeof t.recurringExpense.rule | typeof t.recurringIncome.rule
  let handleClick: () => void
  let splitText: string | null = null

  if (props.type === 'expense') {
    cat = getCategory(props.rule.category)
    title = props.rule.description
    personId = props.rule.paidBy
    tRule = t.recurringExpense.rule
    handleClick = () => props.onEdit(props.rule)
    splitText = splitLabel(props.rule.splitType, personId === viewer.id, t)
  } else {
    const incomeCat = getIncomeCategory(props.rule.category)
    cat = incomeCat
    // `incomeCat.label` is the zh-TW source string; the display name comes
    // from the locale table like every other income-category surface (#1189).
    title = props.rule.source ?? t.incomeCategory[incomeCat.id] ?? incomeCat.label
    personId = props.rule.recipientId
    tRule = t.recurringIncome.rule
    handleClick = () => props.onEdit(props.rule)
  }

  const isPaused = !!rule.pausedAt

  // Payer for expense, recipient for income.
  const personIsViewer = personId === viewer.id
  const personRole = whoToMemberRole(personIsViewer ? 'M' : 'T', viewerIsA)
  const personInitial = personIsViewer ? viewer.initial : (partner?.initial ?? '?')
  const personAvatar = personIsViewer ? viewer.avatarUrl : (partner?.avatarUrl ?? null)
  const personName = personIsViewer ? t.common.you : (partner?.displayName ?? t.common.partner)

  const intervalLabel: Record<number, string> = {
    1: tRule.intervalEveryMonth,
    3: tRule.intervalEveryQuarter,
    6: tRule.intervalEveryHalfYear,
    12: tRule.intervalEveryYear,
  }
  const intervalText =
    intervalLabel[rule.intervalMonths] ??
    tRule.intervalEveryNMonths.replace('{n}', String(rule.intervalMonths))
  const dayText = tRule.dayLabel.replace('{day}', String(rule.dayOfMonth))
  const nextDateText = ruleNextDateText(rule, tRule.nextDate, locale)

  return (
    <li>
      <button
        type="button"
        onClick={handleClick}
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
                {title}
              </div>
              {isPaused && (
                <span
                  className="shrink-0 inline-flex items-center px-2 py-[1px] rounded-full text-xs font-medium leading-none"
                  style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}
                >
                  {tRule.pausedHint}
                </span>
              )}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
              {intervalText}
              {' · '}{dayText}
              {' · '}{formatAmount(rule.amount, 'twd')}
            </div>
            {nextDateText && (
              <div className="text-xs mt-0.5 text-ink-3">
                {nextDateText}
              </div>
            )}
            {!isSolo && (
              <div
                className="text-xs mt-1 flex items-center gap-1.5 flex-wrap"
                style={{ color: 'var(--ink-3)' }}
              >
                <Avatar memberRole={personRole} initial={personInitial} src={personAvatar} size={16} />
                <span className="truncate">{personName}</span>
                {splitText && (
                  <span
                    className="shrink-0 inline-flex items-center px-1.5 py-[1px] rounded-full text-mini font-medium leading-none"
                    style={{ background: 'var(--hairline)', color: 'var(--ink-2)' }}
                  >
                    {splitText}
                  </span>
                )}
              </div>
            )}
          </div>
          <span className="text-sm flex-shrink-0" style={{ color: 'var(--ink-3)' }} aria-hidden="true">›</span>
        </div>
      </button>
    </li>
  )
}
