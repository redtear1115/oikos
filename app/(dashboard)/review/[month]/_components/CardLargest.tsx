'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from '@/lib/i18n/client'
import { getCategory } from '@/lib/categories'
import type { ClientReviewSnapshot } from '@/lib/db/queries/monthlyReview'
import { useBaseCurrency } from '@/app/(dashboard)/_components/MemberContext'
import { CardEmpty, CardShell, formatRecapAmount } from './CardShell'

/**
 * Card 2 — the month's largest expense. `payerName` is resolved on the server
 * within the viewed chapter (#1618); null when the payer is not one of its two
 * people or unknown: the name chip is omitted and the body uses
 * card2BodyNoName (no dangling 「 付的」).
 */
export function CardLargest({
  snapshot,
  payerName,
}: {
  snapshot: ClientReviewSnapshot
  payerName: string | null
}) {
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

  const body = (payerName ? tr.card2Body.replace('{name}', payerName) : tr.card2BodyNoName)
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
          {(localizedCategory || payerName) && (
            <div className="mt-1 text-sm flex items-center flex-wrap gap-x-2" style={{ color: 'var(--ink-3)' }}>
              {localizedCategory && <span>{localizedCategory}</span>}
              {payerName && <span>· {payerName}</span>}
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
