'use client'

import { useTranslations } from '@/lib/i18n/client'
import type { MonthlyReviewSnapshotRow } from '@/lib/db/queries/monthlyReview'
import { CardShell, formatNT } from './CardShell'

export function CardAssets({ snapshot }: { snapshot: MonthlyReviewSnapshotRow }) {
  const t = useTranslations()
  const tr = t.monthlyReview
  const breakdown = snapshot.assetBreakdown

  const tint = '#EFE3D0'
  const max = Math.max(...breakdown.map((r) => r.total), 1)

  return (
    <CardShell title={tr.card4Title} tint={tint}>
      {breakdown.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
          <p className="text-sm" style={{ color: 'var(--ink-3)' }}>
            {tr.emptyAssetBreakdown}
          </p>
        </div>
      ) : (
        <ul className="mt-2 space-y-3">
          {breakdown.map((row, i) => {
            const pct = Math.max(6, Math.round((row.total / max) * 100))
            return (
              <li key={i}>
                <div className="flex items-center justify-between text-sm" style={{ color: 'var(--ink)' }}>
                  <span className="truncate pr-2">{row.assetName || '—'}</span>
                  <span className="tabular-nums shrink-0" style={{ color: 'var(--ink-2)' }}>
                    NT$ {formatNT(row.total)}
                  </span>
                </div>
                <div
                  className="mt-1.5 h-1.5 rounded-full overflow-hidden"
                  style={{ background: 'var(--hairline)' }}
                  aria-hidden="true"
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, background: tint }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </CardShell>
  )
}
