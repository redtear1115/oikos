'use client'

import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from '@/lib/i18n/client'
import type { MonthlyReviewSnapshotRow } from '@/lib/db/queries/monthlyReview'
import type { YearMonth } from '@/lib/monthlyReview'
import type { PartnerQuizQuestionKey, PartnerQuizStatus } from '@/lib/partnerQuiz'
import { Carousel } from './Carousel'
import { CardCategory } from './CardCategory'
import { CardLargest } from './CardLargest'
import { CardRecurring } from './CardRecurring'
import { CardAssets } from './CardAssets'
import { MessageEditor } from './MessageEditor'
import { PastMessages } from './PastMessages'
import { PartnerQuizCard } from './PartnerQuizCard'

export interface ReviewMember {
  id: string
  displayName: string
  avatarUrl: string | null
}

export interface ReviewPastMessage {
  id: string
  memberId: string
  body: string
}

export interface ReviewEditorMessage {
  id: string
  body: string
  lockedAt: string | null
}

export interface ReviewPartnerMessage {
  id: string
  body: string
}

export interface ReviewQuizState {
  status: PartnerQuizStatus
  partnerName: string
  revealPreview: PartnerQuizQuestionKey[]
}

export interface ReviewClientProps {
  reviewedMonth: YearMonth
  editorMonth: YearMonth
  snapshot: MonthlyReviewSnapshotRow | null
  pastMessages: ReviewPastMessage[]
  ownEditorMessage: ReviewEditorMessage | null
  partnerEditorMessage: ReviewPartnerMessage | null
  viewer: ReviewMember
  partner: ReviewMember | null
  isSolo: boolean
  /** Null when solo or before the first monthly snapshot exists. */
  quiz: ReviewQuizState | null
}

export function ReviewClient({
  reviewedMonth,
  editorMonth,
  snapshot,
  pastMessages,
  ownEditorMessage,
  partnerEditorMessage,
  viewer,
  partner,
  isSolo,
  quiz,
}: ReviewClientProps) {
  const router = useRouter()
  const t = useTranslations()
  const locale = useLocale()
  const tr = t.monthlyReview

  return (
    <div className="relative min-h-dvh pb-[120px]">
      <header
        className="px-4 flex items-center justify-between"
        style={{ paddingTop: 'max(var(--safe-top), 24px)', paddingBottom: 8 }}
      >
        <button
          type="button"
          onClick={() => router.back()}
          aria-label={tr.backAriaLabel}
          className="flex items-center gap-1.5 bg-transparent border-0 cursor-pointer min-h-11 px-2 -ml-2 text-sm"
          style={{ color: 'var(--ink-2)', fontFamily: 'inherit' }}
        >
          <svg width="8" height="13" viewBox="0 0 8 13" fill="none" aria-hidden="true">
            <path d="M7 1L1 6.5L7 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t.common.back}
        </button>
        <div className="w-[64px]" aria-hidden="true" />
      </header>

      <div className="px-5 pt-4 pb-6">
        <h1
          className="text-page leading-tight font-serif"
          style={{ color: 'var(--ink)', fontWeight: 500 }}
        >
          {/* CJK templates read `{month} 月`, so they take the number; en needs
              a month name — its template uses `{monthName}` instead (#1178). */}
          {tr.pageTitle
            .replace('{year}', String(reviewedMonth.year))
            .replace('{month}', String(reviewedMonth.month))
            .replace(
              '{monthName}',
              new Intl.DateTimeFormat(locale, { month: 'long' })
                .format(new Date(reviewedMonth.year, reviewedMonth.month - 1, 1)),
            )}
        </h1>
      </div>

      {quiz && (
        <div className="px-5 pb-4">
          <PartnerQuizCard
            reviewedMonth={reviewedMonth}
            status={quiz.status}
            partnerName={quiz.partnerName}
            revealPreview={quiz.revealPreview}
          />
        </div>
      )}

      {snapshot ? (
        <div className="px-2 pb-2">
          <Carousel>
            <CardCategory snapshot={snapshot} isSolo={isSolo} />
            <CardLargest snapshot={snapshot} />
            <CardRecurring snapshot={snapshot} />
            <CardAssets snapshot={snapshot} />
          </Carousel>
        </div>
      ) : (
        <div className="px-5 py-6">
          {/* h2 keeps the outline h1 → h2 → h3 when the cards (whose titles are
              the h2s) aren't rendered (#1178). */}
          <h2
            className="rounded-card px-5 py-6 text-sm font-normal"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--hairline)',
              color: 'var(--ink-2)',
            }}
          >
            {tr.snapshotNotReady}
          </h2>
        </div>
      )}

      {pastMessages.length > 0 && (
        <PastMessages
          messages={pastMessages}
          viewer={viewer}
          partner={partner}
        />
      )}

      <div className="px-4 pt-6">
        <MessageEditor
          editorMonth={editorMonth}
          ownMessage={ownEditorMessage}
          partnerMessage={partnerEditorMessage}
          viewer={viewer}
          partner={partner}
          isSolo={isSolo}
        />
      </div>
    </div>
  )
}
