'use client'

import Link from 'next/link'
import { useTranslations } from '@/lib/i18n/client'

/** Soft halo background — no global token yet; see RevealScreen.tsx for the
 *  matching surface variant. */
const SAGE_SOFT = '#DDEAD8'

export function WaitingScreen({
  partnerName,
  reviewHref,
}: { partnerName: string; reviewHref: string }) {
  const t = useTranslations()
  const tq = t.quiz

  return (
    <div
      className="relative min-h-dvh flex flex-col"
      style={{ background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font-noto-tc), system-ui, sans-serif' }}
    >
      <main className="flex-1 flex flex-col items-center justify-center text-center px-6 max-w-[448px] w-full mx-auto">
        {/* Soft halo motif */}
        <div className="relative mb-10" aria-hidden="true">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              width: 220, height: 220, left: -110, top: -110,
              background: `radial-gradient(circle, ${SAGE_SOFT} 0%, transparent 70%)`,
            }}
          />
          <svg width="200" height="200" viewBox="0 0 200 200">
            <circle cx="100" cy="100" r="90" stroke="var(--credit)" strokeWidth="0.8" fill="none" strokeOpacity="0.35" strokeDasharray="1.2 3" />
            <circle cx="100" cy="100" r="64" stroke="var(--credit)" strokeWidth="0.8" fill="none" strokeOpacity="0.45" strokeDasharray="1.2 3" />
            <circle cx="100" cy="100" r="18" fill="var(--accent)" opacity="0.85" />
          </svg>
        </div>

        <h1
          className="text-2xl leading-snug mb-4"
          style={{ fontFamily: 'var(--font-fraunces), Georgia, serif', fontWeight: 500 }}
        >
          {tq.waitingHeading}
        </h1>
        <p className="mb-10 text-sm" style={{ color: 'var(--ink-2)', lineHeight: 1.7, maxWidth: 320 }}>
          {partnerName ? tq.waitingBody : tq.waitingBody}
        </p>

        <Link
          href={reviewHref}
          className="inline-flex items-center justify-center h-12 px-6 rounded-full text-sm font-medium"
          style={{ background: 'var(--ink)', color: 'var(--on-fill)' }}
        >
          {tq.waitingBackToReview}
        </Link>
      </main>
    </div>
  )
}
