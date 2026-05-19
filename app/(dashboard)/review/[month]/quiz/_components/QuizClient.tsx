'use client'

import Link from 'next/link'
import { useTranslations } from '@/lib/i18n/client'
import { formatYearMonth, type YearMonth } from '@/lib/monthlyReview'
import { QuestionCard } from './QuestionCard'
import { WaitingScreen } from './WaitingScreen'
import { RevealScreen } from './RevealScreen'

export interface QuizMember {
  id: string
  displayName: string
  avatarUrl: string | null
}

export interface QuizAnswerRow {
  memberId: string
  questionKey: string
  choiceKey: string
}

export interface QuizClientProps {
  reviewedMonth: YearMonth
  mode: 'solo' | 'answer' | 'waiting' | 'reveal'
  sessionId: string
  questionKeys: string[]
  selfAnsweredKeys: string[]
  revealedAt: string | null
  viewer: QuizMember
  partner: QuizMember | null
  memberAId: string
  memberBId: string
  answers: QuizAnswerRow[]
}

export function QuizClient(props: QuizClientProps) {
  const t = useTranslations()
  const tq = t.quiz

  const reviewHref = `/review/${formatYearMonth(props.reviewedMonth)}`

  if (props.mode === 'solo') {
    return (
      <FullScreenSurface
        title={tq.revealHeading}
        body={tq.soloFallback}
        backHref={reviewHref}
        backLabel={tq.answerBack}
      />
    )
  }

  if (props.mode === 'reveal') {
    return (
      <RevealScreen
        reviewHref={reviewHref}
        questionKeys={props.questionKeys}
        answers={props.answers}
        viewer={props.viewer}
        partner={props.partner!}
        revealedAt={props.revealedAt}
      />
    )
  }

  if (props.mode === 'waiting') {
    return (
      <WaitingScreen
        partnerName={props.partner?.displayName ?? ''}
        reviewHref={reviewHref}
      />
    )
  }

  return (
    <QuestionCard
      sessionId={props.sessionId}
      questionKeys={props.questionKeys}
      reviewHref={reviewHref}
    />
  )
}

function FullScreenSurface({
  title, body, backHref, backLabel,
}: {
  title: string; body: string; backHref: string; backLabel: string
}) {
  return (
    <div className="relative min-h-dvh" style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
      <div
        className="max-w-[448px] mx-auto px-6 flex flex-col items-center justify-center min-h-dvh text-center"
        style={{ fontFamily: 'var(--font-noto-tc), system-ui, sans-serif' }}
      >
        <h1
          className="text-page leading-tight mb-4"
          style={{ fontFamily: 'var(--font-fraunces), Georgia, serif', fontWeight: 500 }}
        >
          {title}
        </h1>
        <p style={{ color: 'var(--ink-2)', lineHeight: 1.7 }}>{body}</p>
        <Link
          href={backHref}
          className="inline-flex items-center justify-center mt-10 h-12 rounded-full px-6 text-sm font-medium"
          style={{ background: 'var(--ink)', color: 'var(--btn-primary-text)' }}
        >
          {backLabel}
        </Link>
      </div>
    </div>
  )
}
