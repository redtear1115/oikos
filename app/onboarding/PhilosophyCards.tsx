'use client'

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { Translations } from '@/lib/i18n/locales/zh-TW'

const PHILOSOPHY_SEEN_KEY = 'oikos_philosophy_seen'
const TOTAL = 5

// Two motif fills that have no global token yet (#1164). Every other colour on
// this surface reads a token; these stay literal until it is decided whether
// they become tokens or fold into an existing one (`--saving-soft` /
// `--asset-tint-insurance` sit close to sageSoft, `--accent-soft` close to
// dawn). Decorative only — no text is ever drawn in either.
const UNTOKENISED = {
  sageSoft: '#DDEAD8',
  dawn: '#F6D9B4',
}

// Tones are resolved through static class maps so Tailwind can see every
// class name at build time.
type Tone = 'ink' | 'accent' | 'credit'
const FILL: Record<Tone, string> = { ink: 'fill-ink', accent: 'fill-accent', credit: 'fill-credit' }
const STROKE: Record<Tone, string> = { ink: 'stroke-ink', accent: 'stroke-accent', credit: 'stroke-credit' }
const TEXT: Record<Tone, string> = { ink: 'text-ink', accent: 'text-accent', credit: 'text-credit' }
const BG: Record<Tone, string> = { ink: 'bg-ink', accent: 'bg-accent', credit: 'bg-credit' }

// The eyebrow and the skip label have always been set in the platform
// monospace. There is no mono token in the system (#1164 asks whether there
// should be), so this stays the one literal family on the page.
const MONO = { fontFamily: 'ui-monospace, monospace' }

// ─── Brand motifs ─────────────────────────────────────────────

function Orbit({
  size = 200,
  sun = 'accent',
  moon = 'ink',
  ring = 'accent',
  ringOpacity = 0.3,
}: {
  size?: number
  sun?: Tone
  moon?: Tone
  ring?: Tone
  ringOpacity?: number
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <circle
        cx="50" cy="50" r="46"
        className={`${STROKE[ring]} fill-none`}
        strokeOpacity={ringOpacity} strokeWidth="0.9" strokeDasharray="1.2 2.6"
      />
      <circle cx="88" cy="22" r="4.2" className={FILL[sun]} />
      <path
        d="M 11 73 a 4.6 4.6 0 1 0 4.2 -3.5 a 3.5 3.5 0 0 1 -4.2 3.5 z"
        className={FILL[moon]} opacity="0.9"
      />
    </svg>
  )
}

function TwoLeaves({ size = 120, left = 'ink', right = 'accent' }: { size?: number; left?: Tone; right?: Tone }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path d="M 32 54 C 22 47, 12 40, 12 30 C 12 23, 17 19, 22 19 C 27 19, 30 22, 32 26 Z" className={FILL[left]} />
      <circle cx="20" cy="14" r="5" className={FILL[left]} />
      <path d="M 32 54 C 42 47, 52 40, 52 30 C 52 23, 47 19, 42 19 C 37 19, 34 22, 32 26 Z" className={FILL[right]} />
      <circle cx="44" cy="14" r="5" className={FILL[right]} />
    </svg>
  )
}

// ─── Card skeleton ─────────────────────────────────────────────

type OnboardingCopy = Translations['onboarding']

/** `*phrase*` → italic accent, everything else plain. One line per string. */
function renderQuote(lines: readonly string[]) {
  return lines.map((line, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {line.split(/(\*[^*]+\*)/).map((part, j) =>
        part.startsWith('*') && part.endsWith('*') && part.length > 2
          ? <em key={j} className="italic text-accent">{part.slice(1, -1)}</em>
          : <Fragment key={j}>{part}</Fragment>,
      )}
    </Fragment>
  ))
}

interface CardShellProps {
  index: number
  copy: OnboardingCopy
  /** Card surface; `transparent` when a parent paints a split ground. */
  surface: 'bg-bg' | 'bg-transparent'
  tone: Tone
  motif: ReactNode
  onSkip: () => void
  onNext: () => void
}

function CardShell({ index, copy, surface, tone, motif, onSkip, onNext }: CardShellProps) {
  const card = copy.cards[index]
  const pad = (n: number) => String(n).padStart(2, '0')
  const isLast = index === TOTAL - 1

  return (
    <div className={`absolute inset-0 flex flex-col overflow-hidden font-sans ${surface}`}>
      {/* Skip. This card fills the viewport edge to edge and is the topmost
          thing on screen, so the button has to clear the status bar itself
          (#1205). `--safe-top` is the real inset here: /onboarding is outside
          the dashboard shell, so nothing upstream zeroes it (compare
          DESIGN.md § The Safe-Area Rule, which is about pages *inside* the
          shell). The 16px it always had now sits below the inset instead of
          under it. */}
      <button
        type="button"
        onClick={onSkip}
        className="absolute right-5 top-[calc(var(--safe-top)+16px)] z-10 h-8 cursor-pointer rounded-lg border-0 bg-transparent px-3 text-xs uppercase tracking-[1.2px] text-ink-2 opacity-70"
        style={MONO}
      >
        {copy.skip}
        <span aria-hidden="true"> ›</span>
      </button>

      {/* Motif zone — pure illustration */}
      <div aria-hidden="true" className="relative flex h-[340px] shrink-0 items-center justify-center">
        {motif}
      </div>

      {/* Quote zone */}
      <div className="flex flex-1 flex-col justify-start px-8">
        <p className={`mb-3.5 text-xs uppercase tracking-[2px] opacity-80 ${TEXT[tone]}`} style={MONO}>
          {pad(index + 1)} / {pad(TOTAL)} · {card.eyebrow}
        </p>
        {/* Focus lands here when the card changes (see PhilosophyCards). */}
        <h2 tabIndex={-1} className="font-serif text-page font-medium leading-[1.45] tracking-[-0.3px] text-ink outline-none">
          {renderQuote(card.quote)}
        </h2>
        <p className="mt-4 max-w-[300px] text-sm leading-[1.7] text-ink-2">
          {card.subtitle}
        </p>
      </div>

      {/* Bottom controls. pb-13 (52px) is deliberately taller than the iOS
          home-indicator inset (34px), so it needs no env() of its own. */}
      <div className="flex items-center justify-between gap-5 px-6 pb-13">
        {/* Progress is announced through the live region instead. */}
        <div aria-hidden="true" className="flex items-center gap-1.5">
          {Array.from({ length: TOTAL }).map((_, i) => (
            <span
              key={i}
              className={`block h-1.5 rounded-full transition-all duration-300 ease-[ease] ${
                i === index ? `w-[22px] ${BG[tone]}` : 'w-1.5 bg-[var(--grabber)]'
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={onNext}
          className="inline-flex h-12.5 cursor-pointer items-center gap-2 rounded-full border-0 bg-[var(--btn-primary-bg)] px-6.5 text-sm font-medium tracking-label text-[var(--btn-primary-text)]"
        >
          {isLast ? copy.start : copy.next}
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M3 7h8m0 0L7.5 3.5M11 7l-3.5 3.5"
              stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ─── The five cards ────────────────────────────────────────────

type CardProps = { copy: OnboardingCopy; onSkip: () => void; onNext: () => void }

function Card01(props: CardProps) {
  return (
    <CardShell
      {...props}
      index={0} surface="bg-bg" tone="ink"
      motif={
        <div className="relative">
          <div style={{
            position: 'absolute', left: -90, top: -20, width: 360, height: 360,
            background: `radial-gradient(circle at 65% 35%, ${UNTOKENISED.dawn} 0%, transparent 65%)`,
            filter: 'blur(8px)',
          }} />
          <div className="relative">
            <Orbit size={240} ring="ink" ringOpacity={0.18} sun="ink" moon="ink" />
            <div className="absolute inset-0 flex items-center justify-center">
              <TwoLeaves size={86} left="ink" right="ink" />
            </div>
          </div>
        </div>
      }
    />
  )
}

// Two-tone split — ink and coral fields meet at a soft meridian
function Card02(props: CardProps) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(180deg, var(--bg) 0%, var(--bg) 38%, var(--accent-soft) 38%, var(--accent-soft) 100%)' }}
      />
      <CardShell
        {...props}
        index={1} surface="bg-transparent" tone="accent"
        motif={
          <div className="relative">
            <div className="bg-[var(--hairline)]" style={{ position: 'absolute', left: -200, right: -200, top: 180, height: 1 }} />
            <TwoLeaves size={180} left="ink" right="accent" />
          </div>
        }
      />
    </div>
  )
}

// Sun rising — the orbit's sun marker scaled large
function Card03(props: CardProps) {
  return (
    <CardShell
      {...props}
      index={2} surface="bg-bg" tone="accent"
      motif={
        <div className="relative" style={{ width: 320, height: 320 }}>
          <div
            className="rounded-full"
            style={{
              position: 'absolute', top: 30, right: 40, width: 180, height: 180,
              background: 'radial-gradient(circle, var(--accent) 0%, var(--accent) 38%, var(--accent-soft) 60%, transparent 78%)',
            }}
          />
          <svg width="320" height="320" viewBox="0 0 320 320" className="absolute inset-0" aria-hidden="true">
            <path d="M 30 220 A 130 130 0 0 1 290 220"
              className="fill-none stroke-ink" strokeOpacity="0.22" strokeWidth="1.2" strokeDasharray="2 4" />
          </svg>
          <div style={{ position: 'absolute', left: 130, top: 188 }}>
            <TwoLeaves size={64} left="ink" right="accent" />
          </div>
          <div
            className="text-mini tracking-[1.5px] text-ink-2 opacity-60"
            style={{ ...MONO, position: 'absolute', top: 38, right: 220 }}
          >
            {props.copy.paydayMark}
          </div>
        </div>
      }
    />
  )
}

// Sage halo — insurance reframed as promise
function Card04(props: CardProps) {
  return (
    <CardShell
      {...props}
      index={3} surface="bg-bg" tone="credit"
      motif={
        <div className="relative">
          <div
            className="rounded-full opacity-65"
            style={{ position: 'absolute', left: -30, top: -30, width: 280, height: 280, background: UNTOKENISED.sageSoft }}
          />
          <div
            className="rounded-full opacity-85"
            style={{ position: 'absolute', left: 10, top: 10, width: 200, height: 200, background: UNTOKENISED.sageSoft }}
          />
          <svg width="220" height="220" viewBox="0 0 220 220" className="relative" aria-hidden="true">
            <circle cx="110" cy="110" r="98" className="fill-none stroke-credit" strokeWidth="0.8"
              strokeDasharray="1.2 3" opacity="0.35" />
            <circle cx="110" cy="110" r="78" className="fill-none stroke-credit" strokeWidth="0.8"
              strokeDasharray="1.2 3" opacity="0.45" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <TwoLeaves size={94} left="ink" right="accent" />
          </div>
        </div>
      }
    />
  )
}

// Both colors meet — CTA
function Card05(props: CardProps) {
  return (
    <CardShell
      {...props}
      index={4} surface="bg-bg" tone="ink"
      motif={
        <div className="relative">
          <div style={{
            position: 'absolute', left: -120, top: -40, width: 360, height: 360,
            background: `radial-gradient(circle at 30% 30%, ${UNTOKENISED.dawn} 0%, transparent 55%), radial-gradient(circle at 70% 70%, var(--accent-soft) 0%, transparent 55%)`,
            filter: 'blur(4px)',
          }} />
          <div className="relative">
            <Orbit size={240} ring="accent" ringOpacity={0.45} sun="accent" moon="ink" />
            <div className="absolute inset-0 flex items-center justify-center">
              <TwoLeaves size={94} left="ink" right="accent" />
            </div>
          </div>
        </div>
      }
    />
  )
}

const CARDS = [Card01, Card02, Card03, Card04, Card05]

// ─── Main controller ───────────────────────────────────────────

export default function PhilosophyCards({ copy }: { copy: OnboardingCopy }) {
  const router = useRouter()
  const [index, setIndex] = useState(-1) // -1 = checking localStorage
  const stageRef = useRef<HTMLDivElement>(null)
  // Only move focus after the user advanced a card — never on first paint.
  const advancedRef = useRef(false)

  useEffect(() => {
    if (localStorage.getItem(PHILOSOPHY_SEEN_KEY) === 'true') {
      router.replace('/setup')
    } else {
      setIndex(0)
    }
  }, [router])

  // Each card mounts under `key={index}` so the slide-in animation replays.
  // The remount also throws away the button that was just pressed, which
  // dropped focus back to <body> (#1165). Put it on the new card's heading so
  // a screen reader reads the new quote, and the next Tab reaches 繼續.
  useEffect(() => {
    if (!advancedRef.current) return
    stageRef.current?.querySelector<HTMLElement>('h2')?.focus()
  }, [index])

  const proceed = () => {
    localStorage.setItem(PHILOSOPHY_SEEN_KEY, 'true')
    router.push('/setup')
  }

  const onNext = () => {
    if (index >= TOTAL - 1) {
      proceed()
    } else {
      advancedRef.current = true
      setIndex(i => i + 1)
    }
  }

  if (index < 0) return null

  const Card = CARDS[index]
  const progress = copy.progress
    .replace('{current}', String(index + 1))
    .replace('{total}', String(TOTAL))

  return (
    <div className="fixed inset-0 overflow-hidden bg-bg">
      {/* The card slide has to live in a stylesheet, not in an inline style:
          an inline `animation` outranks every rule, so a
          `prefers-reduced-motion` branch could never take it back. (#1022) */}
      <style>{`
        @keyframes cardIn {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0);    }
        }
        .philosophy-card-in { animation: cardIn 0.28s ease; }
        @media (prefers-reduced-motion: reduce) {
          .philosophy-card-in { animation: none; }
        }
      `}</style>
      <h1 className="sr-only">{copy.heading}</h1>
      {/* Lives outside the keyed subtree so it survives the card swap. */}
      <p className="sr-only" aria-live="polite">{progress}</p>
      <div ref={stageRef} className="relative mx-auto h-full max-w-md overflow-hidden">
        <div key={index} className="philosophy-card-in absolute inset-0">
          <Card copy={copy} onSkip={proceed} onNext={onNext} />
        </div>
      </div>
    </div>
  )
}
