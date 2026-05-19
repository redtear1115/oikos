'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from '@/lib/i18n/client'
import {
  PARTNER_QUIZ_CHOICE_KEYS,
  isPartnerQuizQuestionKey,
  type PartnerQuizQuestionKey,
} from '@/lib/partnerQuiz'
import { submitPartnerQuizAnswers } from '@/actions/partnerQuiz'

export interface QuestionCardProps {
  sessionId: string
  questionKeys: string[]
  reviewHref: string
}

export function QuestionCard({ sessionId, questionKeys, reviewHref }: QuestionCardProps) {
  const router = useRouter()
  const t = useTranslations()
  const tq = t.quiz
  const [index, setIndex] = useState(0)
  const [picks, setPicks] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const total = questionKeys.length
  const rawKey = questionKeys[index]
  const currentKey = isPartnerQuizQuestionKey(rawKey) ? rawKey : null
  const selectedChoice = currentKey ? picks[currentKey] : undefined
  const isLast = index === total - 1

  if (!currentKey) {
    return (
      <FallbackError
        reviewHref={reviewHref}
        message={tq.errorNotFound}
        backLabel={tq.answerBack}
      />
    )
  }

  const question = tq.questions[currentKey as PartnerQuizQuestionKey]

  function selectChoice(choice: string) {
    if (!currentKey) return
    setError(null)
    setPicks((prev) => ({ ...prev, [currentKey]: choice }))
  }

  function advance() {
    if (!currentKey) return
    if (!selectedChoice) {
      setError(tq.answerErrorChooseOne)
      return
    }
    if (!isLast) {
      setIndex((i) => i + 1)
      setError(null)
      return
    }
    // Final question: batch submit.
    startTransition(async () => {
      try {
        const answers = questionKeys.map((k) => ({
          questionKey: k,
          choiceKey: picks[k] ?? '',
        }))
        const out = await submitPartnerQuizAnswers({
          sessionId,
          answers,
        })
        // Whether revealed or not, the page Server Component will re-render
        // into the right mode (waiting | reveal) on refresh.
        if (out.revealed) {
          router.refresh()
        } else {
          router.refresh()
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : tq.errors.submitFailed
        setError(message)
      }
    })
  }

  function goBack() {
    setError(null)
    if (index === 0) return
    setIndex((i) => i - 1)
  }

  return (
    <div
      className="relative min-h-dvh flex flex-col"
      style={{
        background: 'var(--bg)',
        color: 'var(--ink)',
        fontFamily: 'var(--font-noto-tc), system-ui, sans-serif',
      }}
    >
      {/* Header — back link */}
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
        <div
          className="text-xs uppercase tracking-[0.18em]"
          style={{ color: 'var(--ink-2)', fontFamily: 'ui-monospace, monospace' }}
        >
          {tq.answerEyebrow}
        </div>
      </header>

      <main className="flex-1 px-6 pt-6 pb-24 max-w-[448px] w-full mx-auto flex flex-col">
        {/* Progress */}
        <div className="flex items-center gap-1.5 mb-7">
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="block transition-all duration-300"
              style={{
                width: i === index ? 22 : 6,
                height: 6,
                borderRadius: 3,
                background: i <= index ? 'var(--accent)' : 'var(--grabber)',
              }}
            />
          ))}
          <span className="ml-3 text-xs" style={{ color: 'var(--ink-2)' }}>
            {tq.answerProgress
              .replace('{current}', String(index + 1))
              .replace('{total}', String(total))}
          </span>
        </div>

        {/* Prompt */}
        <h1
          key={currentKey}
          className="text-2xl leading-snug mb-6 animate-[cardIn_0.28s_ease]"
          style={{
            fontFamily: 'var(--font-fraunces), Georgia, serif',
            color: 'var(--ink)',
            fontWeight: 500,
          }}
        >
          {question.prompt}
        </h1>

        {/* Choices */}
        <ul className="flex flex-col gap-3">
          {PARTNER_QUIZ_CHOICE_KEYS.map((choice) => {
            const isSelected = selectedChoice === choice
            return (
              <li key={choice}>
                <button
                  type="button"
                  onClick={() => selectChoice(choice)}
                  className="w-full text-left px-5 py-4 rounded-2xl transition-all"
                  style={{
                    background: isSelected ? 'var(--accent-soft)' : 'var(--surface)',
                    border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--hairline)'}`,
                    color: 'var(--ink)',
                    fontSize: 'var(--fs-md, 15px)',
                    lineHeight: 1.5,
                  }}
                  aria-pressed={isSelected}
                >
                  <span
                    aria-hidden="true"
                    className="inline-block mr-3 uppercase tracking-[0.12em]"
                    style={{
                      color: isSelected ? 'var(--accent)' : 'var(--ink-3)',
                      fontFamily: 'ui-monospace, monospace',
                      fontSize: 12,
                    }}
                  >
                    {choice}
                  </span>
                  {question.choices[choice]}
                </button>
              </li>
            )
          })}
        </ul>

        {error && (
          <div
            className="mt-5 text-sm"
            role="alert"
            style={{ color: 'var(--destructive)' }}
          >
            {error}
          </div>
        )}

        <div className="mt-auto pt-10 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={goBack}
            disabled={index === 0 || pending}
            className="text-sm py-3 px-2"
            style={{
              color: index === 0 ? 'transparent' : 'var(--ink-2)',
              pointerEvents: index === 0 ? 'none' : 'auto',
            }}
          >
            {t.common.back}
          </button>
          <button
            type="button"
            onClick={advance}
            disabled={pending}
            className="inline-flex items-center gap-2 h-12 px-7 rounded-full text-sm font-semibold"
            style={{
              background: 'var(--ink)',
              color: 'var(--on-fill)',
              opacity: pending ? 0.6 : 1,
            }}
          >
            {pending
              ? t.common.processing
              : isLast
                ? tq.answerCtaFinal
                : tq.answerCta}
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M3 7h8m0 0L7.5 3.5M11 7l-3.5 3.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </main>

      <style>{`
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

function FallbackError({
  reviewHref, message, backLabel,
}: { reviewHref: string; message: string; backLabel: string }) {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 text-center" style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
      <p style={{ color: 'var(--ink-2)' }}>{message}</p>
      <Link
        href={reviewHref}
        className="mt-8 inline-flex items-center justify-center h-12 px-6 rounded-full"
        style={{ background: 'var(--ink)', color: 'var(--on-fill)' }}
      >
        {backLabel}
      </Link>
    </div>
  )
}
