'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { RecurringIncomeContent } from '../../recurring-income/_components/RecurringIncomeContent'
import { RecurringExpenseContent } from '../../recurring-expense/_components/RecurringExpenseContent'
import { useTranslations } from '@/lib/i18n/client'
import { DEFAULT_INCOME_PALETTE } from '@/lib/incomePalettes'
import { SubpageHeader } from '@/app/(dashboard)/_components/SubpageHeader'
import type { RecurringRuleRow } from '@/lib/db/queries/recurringIncome'
import type { RecurringExpenseRuleRow } from '@/lib/db/queries/recurringExpense'

const INCOME_P = DEFAULT_INCOME_PALETTE

type TabKey = 'income' | 'expense'

interface Props {
  incomeRules: RecurringRuleRow[]
  expenseRules: RecurringExpenseRuleRow[]
  insuranceAssets: { id: string; name: string }[]
  groupDefaultRatioA: number | null
}

export function RecurringSettingsContent({
  incomeRules,
  expenseRules,
  insuranceAssets,
  groupDefaultRatioA,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations()

  const rawTab = searchParams.get('tab')
  const activeTab: TabKey = rawTab === 'income' ? 'income' : 'expense'

  const setTab = (tab: TabKey) => {
    if (tab === activeTab) return
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', tab)
    router.replace(`/settings/recurring?${params.toString()}`, { scroll: false })
  }

  return (
    <>
      <SubpageHeader
        title={t.settings.recurringSettings}
        backLabel={t.recurringIncome.back}
      />

      <div
        role="tablist"
        aria-label={t.settings.recurringSettings}
        className="px-4 mt-2 flex gap-2"
      >
        <TabButton
          active={activeTab === 'expense'}
          onClick={() => setTab('expense')}
          label={t.settings.recurringExpense}
        />
        <TabButton
          active={activeTab === 'income'}
          onClick={() => setTab('income')}
          label={t.settings.recurringIncome}
          tone="income"
        />
      </div>

      <div
        role="tabpanel"
        aria-label={activeTab === 'income' ? t.settings.recurringIncome : t.settings.recurringExpense}
      >
        {activeTab === 'income' ? (
          <RecurringIncomeContent
            rules={incomeRules}
            insuranceAssets={insuranceAssets}
          />
        ) : (
          <RecurringExpenseContent
            rules={expenseRules}
            groupDefaultRatioA={groupDefaultRatioA}
          />
        )}
      </div>
    </>
  )
}

function TabButton({
  active,
  onClick,
  label,
  tone = 'default',
}: {
  active: boolean
  onClick: () => void
  label: string
  tone?: 'default' | 'income'
}) {
  const activeBg = tone === 'income' ? INCOME_P.tint : 'var(--btn-primary-bg)'
  const activeColor = tone === 'income' ? INCOME_P.ink : 'var(--btn-primary-text)'
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="flex-1 min-h-11 px-4 rounded-full text-sm font-medium border-0 cursor-pointer transition-colors"
      style={{
        background: active ? activeBg : 'var(--surface)',
        color: active ? activeColor : 'var(--ink-2)',
        border: active ? 'none' : '1px solid var(--hairline)',
      }}
    >
      {label}
    </button>
  )
}
