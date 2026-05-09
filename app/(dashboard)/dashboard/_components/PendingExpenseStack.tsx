'use client'

import { useState } from 'react'
import { PendingExpenseCard } from './PendingExpenseCard'
import { useTranslations } from '@/lib/i18n/client'
import type { PendingExpenseRow } from '@/lib/db/queries/recurringExpense'

export interface PendingExpenseStackProps {
  pendings: PendingExpenseRow[]
  onEdit?: (pending: PendingExpenseRow) => void
}

export function PendingExpenseStack({ pendings, onEdit }: PendingExpenseStackProps) {
  const t = useTranslations()
  const [expanded, setExpanded] = useState(false)
  if (pendings.length === 0) return null

  const visible = expanded ? pendings : pendings.slice(0, 2)
  const stacked = !expanded && pendings.length > 1

  return (
    <section className="mb-4 space-y-3">
      <div className="text-[var(--fs-xs)]" style={{ color: 'var(--ink-3)' }}>
        {t.recurringExpense.pending.sectionLabel}
      </div>
      <div className="space-y-3">
        {visible.map((p, i) => (
          <div
            key={p.id}
            className={stacked && i > 0 ? '-mt-2 scale-[0.98]' : ''}
            style={{
              transformOrigin: 'top center',
              transition: 'transform 0.2s ease',
            }}
          >
            <PendingExpenseCard pending={p} onEdit={onEdit} />
          </div>
        ))}
      </div>
      {pendings.length > 2 && (
        <button
          type="button" onClick={() => setExpanded(!expanded)}
          className="w-full rounded-full py-2 text-[var(--fs-sm)]"
          style={{ border: '1px solid var(--hairline)', color: 'var(--ink-3)' }}
        >
          {expanded
            ? t.recurringExpense.pending.collapse
            : t.recurringExpense.pending.expandAll.replace('{n}', String(pendings.length - 2))}
        </button>
      )}
    </section>
  )
}
