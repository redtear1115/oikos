'use client'

import { useState } from 'react'
import { PendingIncomeCard } from './PendingIncomeCard'
import type { PendingRow } from '@/lib/db/queries/recurringIncome'

export interface PendingIncomeStackProps {
  pendings: PendingRow[]
}

export function PendingIncomeStack({ pendings }: PendingIncomeStackProps) {
  const [expanded, setExpanded] = useState(false)
  if (pendings.length === 0) return null

  const visible = expanded ? pendings : pendings.slice(0, 3)

  return (
    <section className="mb-4 space-y-3">
      <div className="text-[var(--fs-xs)]" style={{ color: 'var(--ink-3)' }}>
        {pendings.length} 筆待確認
      </div>
      {visible.map((p) => (
        <PendingIncomeCard key={p.id} pending={p} />
      ))}
      {pendings.length > 3 && (
        <button
          type="button" onClick={() => setExpanded(!expanded)}
          className="w-full rounded-full py-2 text-[var(--fs-sm)]"
          style={{ border: '1px solid var(--hairline)', color: 'var(--ink-3)' }}
        >
          {expanded ? '收合' : `展開全部（還有 ${pendings.length - 3} 筆）`}
        </button>
      )}
    </section>
  )
}
