'use client'

import type { Translations } from '@/lib/i18n/locales/zh-TW'
import type { CsvStats, DetectedEncoding, MigrateSource } from '@/lib/migrate/csv'

type MigrateStrings = Translations['migrate']

interface Props {
  t: MigrateStrings
  source: MigrateSource
  encoding: DetectedEncoding | null
  stats: CsvStats | null
}

/**
 * Renders the post-parse stats summary. Stays presentational — the parent
 * (`MigrateTool`) owns the file-picker + hook state and decides when to
 * mount this card.
 */
export function MigratePreviewCard({ t, source, encoding, stats }: Props) {
  if (!stats || stats.totalRows === 0) {
    return (
      <div
        className="rounded-2xl px-5 py-6 text-center"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--ink-2)' }}
      >
        {t.preview.empty}
      </div>
    )
  }

  const sourceLabel = t.preview.sourceLabel.replace('{source}', t.sources[source])
  const encodingLabel = encoding
    ? t.preview.encodingLabel.replace('{encoding}', encoding.toUpperCase())
    : null
  const totalRows = t.preview.totalRowsLabel.replace('{count}', String(stats.totalRows))
  const expenseRows = t.preview.expenseRowsLabel.replace('{count}', String(stats.estimatedExpenseRows))
  const dateRange = stats.dateRange
    ? t.preview.dateRangeLabel
        .replace('{first}', stats.dateRange.first)
        .replace('{last}', stats.dateRange.last)
    : null

  return (
    <section
      className="rounded-2xl px-5 py-6 space-y-5"
      style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
    >
      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <h2 className="text-[17px] font-medium" style={{ color: 'var(--ink)' }}>
          {t.preview.title}
        </h2>
        <div
          className="flex items-center gap-2 text-[12px]"
          style={{ color: 'var(--ink-3)', letterSpacing: '0.4px' }}
        >
          <span>{sourceLabel}</span>
          {encodingLabel && (
            <>
              <span aria-hidden>·</span>
              <span>{encodingLabel}</span>
            </>
          )}
        </div>
      </header>

      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label={totalRows} />
        <Stat label={expenseRows} />
        {dateRange && <Stat label={dateRange} />}
      </dl>

      {stats.topCategories.length > 0 && (
        <div>
          <div
            className="text-[12px] mb-2"
            style={{ color: 'var(--ink-3)', letterSpacing: '0.4px' }}
          >
            {t.preview.topCategoriesLabel}
          </div>
          <ul className="flex flex-wrap gap-2">
            {stats.topCategories.map(({ name, count }) => (
              <li
                key={name}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px]"
                style={{ background: 'var(--surface-alt)', color: 'var(--ink)' }}
              >
                <span>{name}</span>
                <span style={{ color: 'var(--ink-3)' }}>× {count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function Stat({ label }: { label: string }) {
  return (
    <div
      className="rounded-xl px-4 py-3 text-[15px]"
      style={{ background: 'var(--surface-alt)', color: 'var(--ink)' }}
    >
      {label}
    </div>
  )
}
