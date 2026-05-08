'use client'

import { useState } from 'react'
import { PendingIncomeCard } from './PendingIncomeCard'
import type { PendingRow } from '@/lib/db/queries/recurringIncome'

export interface PendingIncomeStackProps {
  pendings: PendingRow[]
  onEdit?: (pending: PendingRow) => void
}

export function PendingIncomeStack({ pendings, onEdit }: PendingIncomeStackProps) {
  const [expanded, setExpanded] = useState(false)
  if (pendings.length === 0) return null

  const visible = expanded ? pendings : pendings.slice(0, 2)
  const stacked = !expanded && pendings.length > 1

  return (
    <section className="mb-4 space-y-3">
      <div className="text-[var(--fs-xs)]" style={{ color: 'var(--ink-3)' }}>
        這幾筆等你看看
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
            <PendingIncomeCard pending={p} onEdit={onEdit} />
          </div>
        ))}
      </div>
      {pendings.length > 2 && (
        <button
          type="button" onClick={() => setExpanded(!expanded)}
          className="w-full rounded-full py-2 text-[var(--fs-sm)]"
          style={{ border: '1px solid var(--hairline)', color: 'var(--ink-3)' }}
        >
          {expanded ? '收合' : `展開全部（還有 ${pendings.length - 2} 筆）`}
        </button>
      )}
    </section>
  )
}
