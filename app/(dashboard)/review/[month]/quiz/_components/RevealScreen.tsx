'use client'

import Link from 'next/link'
import { useTranslations, useLocale } from '@/lib/i18n/client'
import { formatDateAbsolute } from '@/lib/format-date'
import {
  isPartnerQuizQuestionKey,
  isPartnerQuizChoiceKey,
  type PartnerQuizQuestionKey,
} from '@/lib/partnerQuiz'
import type { QuizAnswerRow, QuizMember } from './QuizClient'

/** Soft variants used in this screen that don't have a global token yet.
 *  Kept as literals to avoid expanding the global palette for a single
 *  surface. If review/quiz adds more chrome, promote these to globals.css. */
const SAGE_SOFT = '#DDEAD8'
const PARTNER_TONE_BG = '#F4EBE3'

export interface RevealScreenProps {
  reviewHref: string
  questionKeys: string[]
  answers: QuizAnswerRow[]
  viewer: QuizMember
  partner: QuizMember
  revealedAt: string | null
}

export function RevealScreen({
  reviewHref, questionKeys, answers, viewer, partner, revealedAt,
}: RevealScreenProps) {
  const t = useTranslations()
  const locale = useLocale()
  const tq = t.quiz

  const formattedDate = revealedAt ? formatDateAbsolute(revealedAt, locale) : ''

  return (
    <div
      className="relative min-h-dvh"
      style={{
        background: 'var(--bg)',
        color: 'var(--ink)',
        fontFamily: 'var(--font-noto-tc), system-ui, sans-serif',
      }}
    >
      <header
        className="px-4 flex items-center justify-between"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 24px)', paddingBottom: 8 }}
      >
        <Link
          href={reviewHref}
          aria-label={tq.answerBack}
          className="flex items-center gap-1.5 min-h-11 px-2 -ml-2"
          style={{ color: 'var(--ink-2)', fontSize: 'var(--fs-sm)' }}
        >
          <svg width="8" height="13" viewBox="0 0 8 13" fill="none" aria-hidden="true">
            <path d="M7 1L1 6.5L7 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {tq.answerBack}
        </Link>
        <div className="w-16" aria-hidden="true" />
      </header>

      <main className="max-w-[448px] w-full mx-auto px-6 pb-24">
        <div className="pt-2 pb-7">
          <h1
            className="text-page leading-tight"
            style={{ fontFamily: 'var(--font-fraunces), Georgia, serif', fontWeight: 500 }}
          >
            {tq.revealHeading}
          </h1>
          {revealedAt && (
            <div className="mt-3 text-xs" style={{ color: 'var(--ink-3)' }}>
              {tq.revealedAtLine.replace('{date}', formattedDate)}
            </div>
          )}
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-2 gap-3 mb-3 px-1">
          <HeaderChip name={viewer.displayName || tq.revealHeaderA} side="left" />
          <HeaderChip name={partner.displayName || tq.revealHeaderB} side="right" />
        </div>

        <ul className="flex flex-col gap-4">
          {questionKeys.map((rawKey) => {
            if (!isPartnerQuizQuestionKey(rawKey)) return null
            const key = rawKey as PartnerQuizQuestionKey
            const question = tq.questions[key]

            const myAnswer = answers.find(
              (a) => a.questionKey === key && a.memberId === viewer.id,
            )
            const theirAnswer = answers.find(
              (a) => a.questionKey === key && a.memberId === partner.id,
            )

            const myChoice = myAnswer && isPartnerQuizChoiceKey(myAnswer.choiceKey)
              ? question.choices[myAnswer.choiceKey]
              : null
            const theirChoice = theirAnswer && isPartnerQuizChoiceKey(theirAnswer.choiceKey)
              ? question.choices[theirAnswer.choiceKey]
              : null

            const same = myAnswer && theirAnswer && myAnswer.choiceKey === theirAnswer.choiceKey

            return (
              <li
                key={key}
                className="rounded-2xl px-4 py-4"
                style={{
                  background: 'var(--surface)',
                  border: `1px solid var(--hairline)`,
                }}
              >
                <p
                  className="mb-3 text-sm"
                  style={{
                    fontFamily: 'var(--font-fraunces), Georgia, serif',
                    color: 'var(--ink)',
                    fontWeight: 500,
                    lineHeight: 1.5,
                  }}
                >
                  {question.prompt}
                </p>
                {same ? (
                  <div className="flex flex-col gap-2">
                    <div
                      className="rounded-xl px-3 py-3 text-sm leading-relaxed"
                      style={{
                        background: SAGE_SOFT,
                        border: `1px solid var(--credit)`,
                        color: 'var(--ink)',
                      }}
                    >
                      {myChoice}
                    </div>
                    <div
                      className="text-xs"
                      style={{ color: 'var(--credit)', fontFamily: 'ui-monospace, monospace', letterSpacing: '0.08em' }}
                    >
                      ✦ {tq.revealSameAnswer}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <AnswerChip
                      authorLetter={(viewer.displayName[0] ?? '?').toUpperCase()}
                      text={myChoice}
                      tone="self"
                    />
                    <AnswerChip
                      authorLetter={(partner.displayName[0] ?? '?').toUpperCase()}
                      text={theirChoice}
                      tone="partner"
                    />
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        {/* Framing footer */}
        <div
          className="mt-10 rounded-2xl px-5 py-6 text-sm leading-relaxed"
          style={{
            background: 'var(--accent-soft)',
            border: `1px solid var(--accent)`,
            color: 'var(--ink)',
          }}
        >
          {tq.revealFraming}
        </div>

        <div className="mt-10 text-center">
          <Link
            href={reviewHref}
            className="inline-flex items-center justify-center h-12 px-6 rounded-full text-sm font-medium"
            style={{ background: 'var(--ink)', color: 'var(--on-fill)' }}
          >
            {tq.waitingBackToReview}
          </Link>
        </div>
      </main>
    </div>
  )
}

function HeaderChip({ name, side }: { name: string; side: 'left' | 'right' }) {
  return (
    <div
      className="text-xs uppercase tracking-[0.1em]"
      style={{
        color: side === 'left' ? 'var(--accent)' : 'var(--ink)',
        fontFamily: 'ui-monospace, monospace',
        opacity: 0.75,
        textAlign: 'center',
      }}
    >
      {name}
    </div>
  )
}

function AnswerChip({
  authorLetter, text, tone,
}: { authorLetter: string; text: string | null; tone: 'self' | 'partner' }) {
  const bg = tone === 'self' ? 'var(--accent-soft)' : PARTNER_TONE_BG
  const border = tone === 'self' ? 'var(--accent)' : 'var(--hairline)'
  return (
    <div
      className="rounded-xl px-3 py-3 text-sm leading-relaxed relative"
      style={{ background: bg, border: `1px solid ${border}`, color: 'var(--ink)' }}
    >
      <span
        aria-hidden="true"
        className="absolute -top-2 -left-2 inline-flex items-center justify-center text-mini font-semibold"
        style={{
          width: 22, height: 22, borderRadius: 11,
          background: tone === 'self' ? 'var(--accent)' : 'var(--ink)',
          color: 'var(--on-fill)',
        }}
      >
        {authorLetter}
      </span>
      {text}
    </div>
  )
}
