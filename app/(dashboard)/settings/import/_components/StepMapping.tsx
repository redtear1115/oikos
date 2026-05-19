'use client'

import { useMemo } from 'react'
import { useTranslations } from '@/lib/i18n/client'
import { PICKABLE_CATEGORIES } from '@/lib/categories'
import type { ImportRow } from '@/lib/csvImport'

interface Props {
  rows: ImportRow[]
  categoryMap: Record<string, string>
  onChange: (next: Record<string, string>) => void
  onBack: () => void
  onNext: () => void
}

export function StepMapping({ rows, categoryMap, onChange, onBack, onNext }: Props) {
  const t = useTranslations()
  const tImport = t.settings.import.step2

  // Group source categories and count how many rows each one covers — gives
  // the user a sense of which mappings actually matter ("dining shows up 80
  // times, fix that one first; refund only appears once, can leave it as
  // other"). Only expense rows go through this mapping; income rows are all
  // routed to the IncomeTransactions table with category='other' at write
  // time (see actions/import.ts normaliseCategory), so they're skipped here.
  const groups = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of rows) {
      if (row.type !== 'expense') continue
      counts.set(row.category, (counts.get(row.category) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({ key, count }))
  }, [rows])

  function setMap(sourceKey: string, target: string) {
    onChange({ ...categoryMap, [sourceKey]: target })
  }

  return (
    <div className="space-y-4">
      <div
        className="rounded-2xl px-5 py-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
      >
        <div className="text-sm font-medium mb-1" style={{ color: 'var(--ink)' }}>
          {tImport.title}
        </div>
        <div className="text-xs mb-4" style={{ color: 'var(--ink-3)' }}>
          {tImport.subtitle}
        </div>

        {groups.length === 0 ? (
          <div className="text-xs py-4 text-center" style={{ color: 'var(--ink-3)' }}>
            —
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center text-xs px-1" style={{ color: 'var(--ink-3)' }}>
              <div>{tImport.sourceColumn}</div>
              <div />
              <div>{tImport.targetColumn}</div>
            </div>
            {groups.map(({ key, count }) => (
              <div key={key} className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
                <div className="text-sm" style={{ color: 'var(--ink)' }}>
                  <div>{key || tImport.keepOriginal}</div>
                  <div className="text-xs" style={{ color: 'var(--ink-3)' }}>
                    {tImport.rowCount.replace('{count}', String(count))}
                  </div>
                </div>
                <div className="text-sm" style={{ color: 'var(--ink-3)' }}>›</div>
                <select
                  value={categoryMap[key] ?? key}
                  onChange={(e) => setMap(key, e.target.value)}
                  className="w-full h-10 px-3 rounded-lg text-sm cursor-pointer"
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--hairline)',
                    color: 'var(--ink)',
                  }}
                >
                  {PICKABLE_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>

      <NavButtons onBack={onBack} onNext={onNext} />
    </div>
  )
}

function NavButtons({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const t = useTranslations().settings.import.step2
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={onBack}
        className="flex-1 h-11 rounded-xl text-sm cursor-pointer"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--ink-2)' }}
      >
        {t.backCta}
      </button>
      <button
        type="button"
        onClick={onNext}
        className="flex-[1.4] h-11 rounded-xl text-sm text-white cursor-pointer"
        style={{ background: 'var(--btn-primary-bg)' }}
      >
        {t.nextCta}
      </button>
    </div>
  )
}
