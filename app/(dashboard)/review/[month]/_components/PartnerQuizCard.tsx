'use client'

import Link from 'next/link'
import { useTranslations } from '@/lib/i18n/client'
import type { PartnerQuizStatus } from '@/lib/partnerQuiz'

const C = {
  bg: '#FFFFFF',
  bgWaiting: 'rgba(122,88,72,0.06)',
  bgRevealed: '#FBEDE0',
  ink: '#3A2419',
  ink2: '#7A5848',
  accent: '#E08856',
  hairline: 'rgba(58,36,25,0.12)',
}

export interface PartnerQuizCardProps {
  reviewedMonth: { year: number; month: number }
  status: PartnerQuizStatus
  partnerName: string
  /** When status === 'revealed', a tiny preview of the question prompts. */
  revealPreview?: string[]
}

export function PartnerQuizCard({
  reviewedMonth, status, partnerName, revealPreview,
}: PartnerQuizCardProps) {
  const t = useTranslations()
  const tq = t.quiz

  // The quiz page resolves itself from the spec — we always route to the same
  // /review/[YYYY-MM]/quiz URL regardless of state.
  const href = `/review/${reviewedMonth.year}-${String(reviewedMonth.month).padStart(2, '0')}/quiz`

  if (status === 'self_done_partner_pending') {
    // Waiting variant: read-only, no CTA.
    return (
      <div
        className="rounded-2xl px-5 py-5"
        style={{ background: C.bgWaiting, border: `1px solid ${C.hairline}` }}
      >
        <div
          className="text-xs uppercase tracking-[0.18em] mb-2"
          style={{ color: C.ink2, fontFamily: 'ui-monospace, monospace' }}
        >
          {tq.answerEyebrow}
        </div>
        <p
          className="text-base leading-snug"
          style={{
            fontFamily: 'var(--font-fraunces), Georgia, serif',
            color: C.ink,
            fontWeight: 500,
          }}
        >
          {tq.cardHeadingSelfDonePartnerPending.replace('{partnerName}', partnerName)}
        </p>
      </div>
    )
  }

  if (status === 'revealed') {
    return (
      <Link
        href={href}
        className="block rounded-2xl px-5 py-5 transition-shadow"
        style={{ background: C.bgRevealed, border: `1px solid ${C.accent}` }}
      >
        <div
          className="text-xs uppercase tracking-[0.18em] mb-2"
          style={{ color: C.accent, fontFamily: 'ui-monospace, monospace' }}
        >
          {tq.answerEyebrow}
        </div>
        <p
          className="text-base leading-snug mb-2"
          style={{
            fontFamily: 'var(--font-fraunces), Georgia, serif',
            color: C.ink,
            fontWeight: 500,
          }}
        >
          {tq.cardHeadingRevealed}
        </p>
        {revealPreview && revealPreview.length > 0 && (
          <ul className="my-2 flex flex-col gap-1">
            {revealPreview.slice(0, 3).map((line, i) => (
              <li
                key={i}
                className="text-xs truncate"
                style={{ color: C.ink2 }}
              >
                · {line}
              </li>
            ))}
          </ul>
        )}
        <div
          className="text-sm font-medium mt-2"
          style={{ color: C.accent }}
        >
          {tq.cardCtaReveal}
        </div>
      </Link>
    )
  }

  const heading =
    status === 'invited'
      ? tq.cardHeadingInvitation
      : status === 'self_pending_partner_done'
        ? tq.cardHeadingSelfPendingPartnerDone
        : tq.cardHeadingSelfPendingPartnerPending

  return (
    <Link
      href={href}
      className="block rounded-2xl px-5 py-5 transition-shadow"
      style={{ background: C.bg, border: `1px solid ${C.hairline}` }}
    >
      <div
        className="text-xs uppercase tracking-[0.18em] mb-2"
        style={{ color: C.ink2, fontFamily: 'ui-monospace, monospace' }}
      >
        {tq.answerEyebrow}
      </div>
      <p
        className="text-base leading-snug mb-3"
        style={{
          fontFamily: 'var(--font-fraunces), Georgia, serif',
          color: C.ink,
          fontWeight: 500,
        }}
      >
        {heading}
      </p>
      <div
        className="text-sm font-medium"
        style={{ color: C.accent }}
      >
        {tq.cardCtaStart}
      </div>
    </Link>
  )
}
