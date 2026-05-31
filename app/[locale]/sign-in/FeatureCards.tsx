import type { ReactNode } from 'react'
import type { Translations } from '@/lib/i18n/locales/zh-TW'
import { DuoGlyph } from '../_landing/FutariMark'

type Features = Translations['signIn']['features']

// Right-column scene cards on /sign-in (#417). Mobile + desktop both render
// the cards as a vertical 1×4 stack (the desktop right column is narrow, so
// stacking reads better than a 2×2 grid). Cards share landing's design
// language — italic kicker, chip glyph, semibold title, soft body — but each
// card commits to its own hue so the four scenes feel distinct rather than
// like four near-identical tiles.

export function FeatureCards({ t }: { t: Features }) {
  return (
    <div className="flex flex-col gap-3 lg:gap-4">
      <SceneCard
        kicker="01"
        chipColor="var(--accent)"
        chipBg="var(--accent-soft)"
        glyph={<DuoGlyph />}
        title={t.c1Title}
        body={t.c1Body}
        delay={0}
      />
      <SceneCard
        kicker="02"
        chipColor="var(--asset-color-car)"
        chipBg="var(--asset-tint-car)"
        glyph={<PlaneGlyph />}
        title={t.c2Title}
        body={t.c2Body}
        delay={80}
      />
      <SceneCard
        kicker="03"
        chipColor="var(--asset-color-child)"
        chipBg="var(--asset-tint-child)"
        glyph={<MemoGlyph />}
        title={t.c3Title}
        body={t.c3Body}
        delay={160}
      />
      <SceneCard
        kicker="04"
        chipColor="var(--saving)"
        chipBg="var(--saving-soft)"
        glyph={<PrivacyGlyph />}
        title={t.c4Title}
        body={t.c4Body}
        delay={240}
      />
    </div>
  )
}

function SceneCard({
  kicker,
  chipColor,
  chipBg,
  glyph,
  title,
  body,
  delay,
}: {
  kicker: string
  chipColor: string
  chipBg: string
  glyph: ReactNode
  title: string
  body: string
  delay: number
}) {
  return (
    <article
      className="
        flex gap-4 items-start
        rounded-tile p-5
        opacity-0
        [animation:scene-card-in_520ms_cubic-bezier(0.22,0.61,0.36,1)_forwards]
        motion-reduce:opacity-100 motion-reduce:[animation:none]
      "
      style={{
        background: 'var(--surface)',
        boxShadow: '0 1px 0 var(--hairline)',
        animationDelay: `${delay}ms`,
      }}
    >
      <div
        className="flex items-center justify-center w-11 h-11 rounded-bubble shrink-0"
        style={{ background: chipBg, color: chipColor }}
        aria-hidden="true"
      >
        {glyph}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3 mb-1.5">
          <p
            className="m-0 text-base font-medium leading-snug"
            style={{ color: 'var(--ink)', letterSpacing: '-0.2px' }}
          >
            {title}
          </p>
          <span
            className="shrink-0 text-sm"
            style={{
              fontFamily: 'var(--font-fraunces)',
              fontStyle: 'italic',
              color: 'var(--ink-3)',
              letterSpacing: '0.5px',
            }}
          >
            {kicker}
          </span>
        </div>
        <p
          className="m-0 text-sm leading-[1.65]"
          style={{ color: 'var(--ink-2)' }}
        >
          {body}
        </p>
      </div>
      <style>{`
        @keyframes scene-card-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </article>
  )
}

// Stroke-only glyphs matching landing's FutariMark style. `currentColor` lets
// each chip's `color` token drive the stroke.

function PlaneGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 13 L21 5 L15 21 L12 14 L3 13 Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M12 14 L21 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function MemoGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 5 H 19 V 16 H 11 L 7 20 V 16 H 5 Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M9 10.5 H 15"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function PrivacyGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3 L20 6 V12 C 20 16.5 16.5 19.5 12 21 C 7.5 19.5 4 16.5 4 12 V 6 Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="9.5" cy="11" r="1.6" fill="currentColor" />
      <circle cx="14.5" cy="11" r="1.6" fill="currentColor" />
      <path
        d="M8 15.5 C 9 14.3 10.4 13.7 12 13.7 C 13.6 13.7 15 14.3 16 15.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}
