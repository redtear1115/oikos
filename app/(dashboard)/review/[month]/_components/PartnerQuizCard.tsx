'use client'

import Link from 'next/link'
import { useTranslations } from '@/lib/i18n/client'
import type { PartnerQuizQuestionKey, PartnerQuizStatus } from '@/lib/partnerQuiz'

// bgRevealed / ink / ink2 / accent point at the live tokens they used to
// duplicate as hex (#1179). bgWaiting / hairline stay literal: their alphas
// (0.06 / 0.12) have no token equivalent, and swapping in --hairline (0.10)
// would be a silent visual change.
const C = {
  bg: 'var(--surface)',
  bgWaiting: 'rgba(122,88,72,0.06)',
  bgRevealed: 'var(--bg)',
  ink: 'var(--ink)',
  ink2: 'var(--ink-2)',
  accent: 'var(--accent)',
  hairline: 'rgba(58,36,25,0.12)',
}

export interface PartnerQuizCardProps {
  reviewedMonth: { year: number; month: number }
  status: PartnerQuizStatus
  partnerName: string
  /** When status === 'revealed', the session's question keys — rendered as
   *  their localized prompts, never as the raw identifiers (#1178). */
  revealPreview?: PartnerQuizQuestionKey[]
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
            {revealPreview.slice(0, 3).map((key) => (
              <li
                key={key}
                className="text-xs truncate"
                style={{ color: C.ink2 }}
              >
                · {tq.questions[key].prompt}
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
