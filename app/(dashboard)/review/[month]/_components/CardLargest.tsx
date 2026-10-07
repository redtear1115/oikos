'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from '@/lib/i18n/client'
import { getCategory } from '@/lib/categories'
import type { MonthlyReviewSnapshotRow } from '@/lib/db/queries/monthlyReview'
import { useBaseCurrency } from '@/app/(dashboard)/_components/MemberContext'
import { CardEmpty, CardShell, formatRecapAmount } from './CardShell'

export function CardLargest({ snapshot }: { snapshot: MonthlyReviewSnapshotRow }) {
  const router = useRouter()
  const baseCurrency = useBaseCurrency()
  const t = useTranslations()
  const tr = t.monthlyReview

  const empty = !snapshot.largestExpenseAmount || snapshot.largestExpenseAmount <= 0
  const category = snapshot.largestExpenseCategory
    ? getCategory(snapshot.largestExpenseCategory)
    : null
  const tint = category?.tint ?? 'var(--hairline)'

  const localizedCategory = category
    ? (t.category[category.id as keyof typeof t.category] ?? category.label)
    : ''

  const body = tr.card2Body
    .replace('{name}', snapshot.largestExpensePaidByName ?? '')
    .replace('{description}', snapshot.largestExpenseDescription ?? '')
    .replace('{amount}', formatRecapAmount(snapshot.largestExpenseAmount ?? 0, baseCurrency))

  return (
    <CardShell title={tr.card2Title} tint={tint}>
      {empty ? (
        <CardEmpty body={tr.emptyCardBody} cta={tr.emptyCardCta} onCta={() => router.push('/dashboard')} />
      ) : (
        <div className="flex-1 flex flex-col">
          <div className="text-3xl font-medium mt-2" style={{ color: 'var(--ink)' }}>
            {formatRecapAmount(snapshot.largestExpenseAmount ?? 0, baseCurrency)}
          </div>
          <div className="mt-2 text-base" style={{ color: 'var(--ink)' }}>
            {snapshot.largestExpenseDescription}
          </div>
          {(localizedCategory || snapshot.largestExpensePaidByName) && (
            <div className="mt-1 text-sm flex items-center flex-wrap gap-x-2" style={{ color: 'var(--ink-3)' }}>
              {localizedCategory && <span>{localizedCategory}</span>}
              {snapshot.largestExpensePaidByName && <span>· {snapshot.largestExpensePaidByName}</span>}
            </div>
          )}
          <p className="text-sm mt-5 leading-relaxed" style={{ color: 'var(--ink-2)' }}>
            {body}
          </p>
        </div>
      )}
    </CardShell>
  )
}
