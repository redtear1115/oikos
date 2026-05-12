'use client'

import Link from 'next/link'
import { useTranslations } from '@/lib/i18n/client'

const C = {
  bg: '#FBEDE0',
  ink: '#3A2419',
  ink2: '#7A5848',
  accent: '#E08856',
  sage: '#7A9F7E',
  sageSoft: '#DDEAD8',
}

export function WaitingScreen({
  partnerName,
  reviewHref,
}: { partnerName: string; reviewHref: string }) {
  const t = useTranslations()
  const tq = t.quiz

  return (
    <div
      className="relative min-h-dvh flex flex-col"
      style={{ background: C.bg, color: C.ink, fontFamily: 'var(--font-noto-tc), system-ui, sans-serif' }}
    >
      <main className="flex-1 flex flex-col items-center justify-center text-center px-6 max-w-[448px] w-full mx-auto">
        {/* Soft halo motif */}
        <div className="relative mb-10" aria-hidden="true">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              width: 220, height: 220, left: -110, top: -110,
              background: `radial-gradient(circle, ${C.sageSoft} 0%, transparent 70%)`,
            }}
          />
          <svg width="200" height="200" viewBox="0 0 200 200">
            <circle cx="100" cy="100" r="90" stroke={C.sage} strokeWidth="0.8" fill="none" strokeOpacity="0.35" strokeDasharray="1.2 3" />
            <circle cx="100" cy="100" r="64" stroke={C.sage} strokeWidth="0.8" fill="none" strokeOpacity="0.45" strokeDasharray="1.2 3" />
            <circle cx="100" cy="100" r="18" fill={C.accent} opacity="0.85" />
          </svg>
        </div>

        <h1
          className="text-2xl leading-snug mb-4"
          style={{ fontFamily: 'var(--font-fraunces), Georgia, serif', fontWeight: 500 }}
        >
          {tq.waitingHeading}
        </h1>
        <p className="mb-10 text-sm" style={{ color: C.ink2, lineHeight: 1.7, maxWidth: 320 }}>
          {partnerName ? tq.waitingBody : tq.waitingBody}
        </p>

        <Link
          href={reviewHref}
          className="inline-flex items-center justify-center h-12 px-6 rounded-full text-sm font-medium"
          style={{ background: C.ink, color: '#fff' }}
        >
          {tq.waitingBackToReview}
        </Link>
      </main>
    </div>
  )
}
