'use client'

import { useTranslations } from '@/lib/i18n/client'
import { getCategory } from '@/lib/categories'
import { getIncomeCategory } from '@/lib/incomeCategories'
import type { ImportRow } from '@/lib/csvImport'
import { SectionCard } from './SectionCard'
import { WizardNavButtons } from './WizardNavButtons'

interface Props {
  rows: ImportRow[]
  invalidCount: number
  onBack: () => void
  onConfirm: () => void
  submitting: boolean
}

const PREVIEW_LIMIT = 20

export function StepConfirm({ rows, invalidCount, onBack, onConfirm, submitting }: Props) {
  const t = useTranslations()
  const tImport = t.settings.import.step4

  const preview = rows.slice(0, PREVIEW_LIMIT)
  const remaining = Math.max(0, rows.length - preview.length)

  return (
    <div className="space-y-4">
      <SectionCard title={tImport.title} subtitle={tImport.subtitle}>
        <div className="text-xs mb-3" style={{ color: 'var(--ink-2)' }}>
          {tImport.summary
            .replace('{count}', String(rows.length))
            .replace('{invalid}', String(invalidCount))}
        </div>

        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-xs" style={{ color: 'var(--ink)' }}>
            <thead>
              <tr style={{ color: 'var(--ink-3)' }}>
                <th className="text-left font-normal py-1 px-2 whitespace-nowrap">{tImport.tableHeader.date}</th>
                <th className="text-left font-normal py-1 px-2">{tImport.tableHeader.description}</th>
                <th className="text-left font-normal py-1 px-2 whitespace-nowrap">{tImport.tableHeader.category}</th>
                <th className="text-right font-normal py-1 px-2 whitespace-nowrap">{tImport.tableHeader.amount}</th>
                <th className="text-right font-normal py-1 px-2 whitespace-nowrap">{tImport.tableHeader.type}</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((row, i) => {
                const cat = row.type === 'expense' ? getCategory(row.category) : getIncomeCategory(row.category)
                return (
                  <tr
                    key={i}
                    style={{ borderTop: '1px solid var(--hairline)' }}
                  >
                    <td className="py-2 px-2 whitespace-nowrap" style={{ color: 'var(--ink-2)' }}>
                      {row.date.toISOString().slice(0, 10)}
                    </td>
                    <td className="py-2 px-2 max-w-[140px] truncate">{row.description || '—'}</td>
                    <td className="py-2 px-2 whitespace-nowrap">
                      <span
                        className="px-2 py-0.5 rounded-md text-[11px]"
                        style={{ background: cat.tint, color: cat.ink }}
                      >
                        {cat.label}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right whitespace-nowrap">
                      {row.amount.toLocaleString()}
                    </td>
                    <td className="py-2 px-2 text-right whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>
                      {row.type === 'expense' ? tImport.typeExpense : tImport.typeIncome}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {remaining > 0 && (
          <div className="text-xs mt-3 text-center" style={{ color: 'var(--ink-3)' }}>
            {tImport.moreRows.replace('{count}', String(remaining))}
          </div>
        )}
      </SectionCard>

      <WizardNavButtons
        onBack={onBack}
        backLabel={tImport.backCta}
        onNext={onConfirm}
        nextLabel={
          submitting
            ? tImport.confirming
            : tImport.confirmCta.replace('{count}', String(rows.length))
        }
        loading={submitting}
        disabled={rows.length === 0}
      />
    </div>
  )
}
