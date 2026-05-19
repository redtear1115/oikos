'use client'

import { useState } from 'react'
import { useTranslations } from '@/lib/i18n/client'
import type { ImportBatchSummary } from '@/actions/import'

interface Props {
  history: ImportBatchSummary[]
  onRollback: (batchId: string) => void
  rollbacking: boolean
}

export function ImportHistory({ history, onRollback, rollbacking }: Props) {
  const t = useTranslations()
  const tImport = t.settings.import.history
  const [confirmId, setConfirmId] = useState<string | null>(null)

  if (history.length === 0) {
    return (
      <div className="mt-2">
        <div className="text-xs font-medium px-1 mb-2" style={{ color: 'var(--ink-3)' }}>
          {tImport.title}
        </div>
        <div
          className="rounded-2xl px-5 py-6 text-center text-xs"
          style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--ink-3)' }}
        >
          {tImport.empty}
        </div>
      </div>
    )
  }

  return (
    <div className="mt-2">
      <div className="text-xs font-medium px-1 mb-2" style={{ color: 'var(--ink-3)' }}>
        {tImport.title}
      </div>
      <div className="space-y-2">
        {history.map((batch) => {
          const isRolledBack = batch.status === 'rolled_back'
          const isConfirming = confirmId === batch.id
          return (
            <div
              key={batch.id}
              className="rounded-2xl px-5 py-4"
              style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>
                    {batch.fileName}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
                    {batch.source} · {formatDate(batch.createdAt)} · {batch.importedCount}
                  </div>
                </div>
                <span
                  className="text-xs px-2 py-0.5 rounded-md whitespace-nowrap"
                  style={{
                    background: isRolledBack ? 'var(--surface-alt)' : 'var(--surface-alt)',
                    color: isRolledBack ? 'var(--ink-3)' : 'var(--ink-2)',
                  }}
                >
                  {isRolledBack ? tImport.rolledBack : tImport.completed}
                </span>
              </div>

              {!isRolledBack && (
                <div className="text-xs mt-2" style={{ color: 'var(--ink-3)' }}>
                  {batch.rollbackable ? tImport.rollbackableTag : tImport.expiredTag}
                </div>
              )}

              {!isRolledBack && batch.rollbackable && (
                isConfirming ? (
                  <div className="flex gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      disabled={rollbacking}
                      className="flex-1 h-9 rounded-lg text-xs cursor-pointer disabled:opacity-50"
                      style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--ink-2)' }}
                    >
                      {t.common.cancel}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRollback(batch.id)}
                      disabled={rollbacking}
                      className="flex-1 h-9 rounded-lg text-xs cursor-pointer disabled:opacity-50"
                      style={{ background: 'var(--surface)', border: '1px solid var(--debit)', color: 'var(--debit)' }}
                    >
                      {rollbacking ? t.settings.import.result.rollbacking : t.settings.import.result.rollbackCta}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmId(batch.id)}
                    className="mt-3 text-xs underline cursor-pointer"
                    style={{ color: 'var(--ink-2)' }}
                  >
                    {t.settings.import.result.rollbackCta}
                  </button>
                )
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function formatDate(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}
