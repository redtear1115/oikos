'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from '@/lib/i18n/client'
import { getCategory } from '@/lib/categories'
import type { MonthlyReviewSnapshotRow } from '@/lib/db/queries/monthlyReview'
import { CardEmpty, CardShell, formatNT } from './CardShell'

export function CardCategory({
  snapshot,
  isSolo,
}: {
  snapshot: MonthlyReviewSnapshotRow
  isSolo: boolean
}) {
  const router = useRouter()
  const t = useTranslations()
  const tr = t.monthlyReview

  const category = snapshot.topCategory ? getCategory(snapshot.topCategory) : null
  const total = snapshot.topCategoryTotal ?? 0
  const empty = !snapshot.topCategory || total <= 0

  const tint = category?.tint ?? 'var(--surface-2, var(--hairline))'

  const localizedCategory = category
    ? (t.category[category.id as keyof typeof t.category] ?? category.label)
    : ''

  const bodyTemplate = isSolo ? tr.card1BodySolo : tr.card1Body
  const body = bodyTemplate
    .replace('{category}', localizedCategory)
    .replace('{amount}', formatNT(total))

  return (
    <CardShell title={tr.card1Title} tint={tint}>
      {empty ? (
        <CardEmpty body={tr.emptyCardBody} cta={tr.emptyCardCta} onCta={() => router.push('/dashboard')} />
      ) : (
        <div className="flex-1 flex flex-col">
          <div className="flex items-center gap-3 mt-2">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-medium"
              style={{ background: tint, color: category?.ink ?? 'var(--ink)' }}
            >
              {category?.mono ?? '·'}
            </div>
            <div className="flex-1">
              <div className="text-xs" style={{ color: 'var(--ink-3)' }}>
                {localizedCategory}
              </div>
              <div className="text-2xl font-medium" style={{ color: 'var(--ink)' }}>
                NT$ {formatNT(total)}
              </div>
            </div>
          </div>
          <p className="text-sm mt-5 leading-relaxed" style={{ color: 'var(--ink-2)' }}>
            {body}
          </p>
        </div>
      )}
    </CardShell>
  )
}
