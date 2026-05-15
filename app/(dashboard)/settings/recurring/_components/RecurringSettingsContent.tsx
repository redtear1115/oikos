'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { RecurringIncomeContent } from '../../recurring-income/_components/RecurringIncomeContent'
import { RecurringExpenseContent } from '../../recurring-expense/_components/RecurringExpenseContent'
import { useTranslations } from '@/lib/i18n/client'
import type { RecurringRuleRow } from '@/lib/db/queries/recurringIncome'
import type { RecurringExpenseRuleRow } from '@/lib/db/queries/recurringExpense'

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
  const activeTab: TabKey = rawTab === 'expense' ? 'expense' : 'income'

  const setTab = (tab: TabKey) => {
    if (tab === activeTab) return
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', tab)
    router.replace(`/settings/recurring?${params.toString()}`, { scroll: false })
  }

  return (
    <>
      <div
        className="px-4 flex items-center justify-between"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 24px)', paddingBottom: 8 }}
      >
        <button
          type="button"
          onClick={() => router.push('/settings')}
          className="flex items-center gap-1.5 bg-transparent border-0 cursor-pointer min-h-11 px-2 -ml-2"
          style={{ color: 'var(--ink-2)', fontFamily: 'inherit', fontSize: 'var(--fs-sm)' }}
        >
          <svg width="8" height="13" viewBox="0 0 8 13" fill="none" aria-hidden="true">
            <path d="M7 1L1 6.5L7 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t.recurringIncome.back}
        </button>

        <div className="text-base font-semibold" style={{ color: 'var(--ink)' }}>
          {t.settings.recurringSettings}
        </div>

        {/* Spacer to keep the title visually centred against the back button. */}
        <div className="min-h-11 w-12" aria-hidden="true" />
      </div>

      <div
        role="tablist"
        aria-label={t.settings.recurringSettings}
        className="px-4 mt-2 flex gap-2"
      >
        <TabButton
          active={activeTab === 'income'}
          onClick={() => setTab('income')}
          label={t.settings.recurringIncome}
        />
        <TabButton
          active={activeTab === 'expense'}
          onClick={() => setTab('expense')}
          label={t.settings.recurringExpense}
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
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="flex-1 min-h-11 px-4 rounded-full text-sm font-medium border-0 cursor-pointer transition-colors"
      style={{
        background: active ? 'var(--btn-primary-bg)' : 'var(--surface)',
        color: active ? 'var(--btn-primary-text)' : 'var(--ink-2)',
        border: active ? 'none' : '1px solid var(--hairline)',
      }}
    >
      {label}
    </button>
  )
}
