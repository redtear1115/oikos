'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const PHILOSOPHY_SEEN_KEY = 'oikos_philosophy_seen'
const TOTAL = 5

const c = {
  bg: '#FBEDE0',
  ink: '#3A2419',
  ink2: '#7A5848',
  ink3: '#B89C8B',
  accent: '#E08856',
  accentSoft: '#F8D9C2',
  sage: '#7A9F7E',
  sageSoft: '#DDEAD8',
  dawn: '#F6D9B4',
}

// ─── Brand motifs ─────────────────────────────────────────────

function Orbit({
  size = 200,
  sunFill = c.accent,
  moonFill = c.ink,
  ringColor = c.accent,
  ringOpacity = 0.3,
  dashed = true,
}: {
  size?: number
  sunFill?: string
  moonFill?: string
  ringColor?: string
  ringOpacity?: number
  dashed?: boolean
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <circle
        cx="50" cy="50" r="46"
        stroke={ringColor} strokeOpacity={ringOpacity} strokeWidth="0.9"
        strokeDasharray={dashed ? '1.2 2.6' : 'none'} fill="none"
      />
      <circle cx="88" cy="22" r="4.2" fill={sunFill} />
      <path
        d="M 11 73 a 4.6 4.6 0 1 0 4.2 -3.5 a 3.5 3.5 0 0 1 -4.2 3.5 z"
        fill={moonFill} opacity="0.9"
      />
    </svg>
  )
}

function TwoLeaves({ size = 120, ink = c.ink, accent = c.accent }: { size?: number; ink?: string; accent?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <path d="M 32 54 C 22 47, 12 40, 12 30 C 12 23, 17 19, 22 19 C 27 19, 30 22, 32 26 Z" fill={ink} />
      <circle cx="20" cy="14" r="5" fill={ink} />
      <path d="M 32 54 C 42 47, 52 40, 52 30 C 52 23, 47 19, 42 19 C 37 19, 34 22, 32 26 Z" fill={accent} />
      <circle cx="44" cy="14" r="5" fill={accent} />
    </svg>
  )
}

// ─── Card skeleton ─────────────────────────────────────────────

interface CardShellProps {
  index: number
  bg: string
  accent?: string
  eyebrow?: string
  quote: React.ReactNode
  subtitle?: string
  ctaLabel?: string
  motif: React.ReactNode
  onSkip: () => void
  onNext: () => void
}

function CardShell({ index, bg, accent = c.ink, eyebrow, quote, subtitle, ctaLabel = '繼續', motif, onSkip, onNext }: CardShellProps) {
  return (
    <div style={{
      position: 'absolute', inset: 0, background: bg, overflow: 'hidden',
      fontFamily: 'var(--font-noto-tc), system-ui, sans-serif',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Skip */}
      <button
        onClick={onSkip}
        style={{
          position: 'absolute', top: 16, right: 20, zIndex: 10,
          height: 32, padding: '0 12px', borderRadius: 8,
          border: 'none', background: 'transparent',
          color: c.ink2, opacity: 0.7,
          fontFamily: 'ui-monospace, monospace',
          fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase',
          cursor: 'pointer',
        }}
      >
        跳過 ›
      </button>

      {/* Motif zone */}
      <div style={{
        height: 340, position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {motif}
      </div>

      {/* Quote zone */}
      <div style={{ flex: 1, padding: '0 32px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
        {eyebrow && (
          <div style={{
            fontFamily: 'ui-monospace, monospace',
            fontSize: 11, letterSpacing: 2, color: accent, opacity: 0.8,
            textTransform: 'uppercase', marginBottom: 14,
          }}>
            {eyebrow}
          </div>
        )}
        <div style={{
          fontFamily: 'var(--font-fraunces), Georgia, serif',
          fontSize: 26, fontWeight: 500, color: c.ink,
          letterSpacing: -0.3, lineHeight: 1.45,
        }}>
          {quote}
        </div>
        {subtitle && (
          <div style={{ marginTop: 16, fontSize: 14, color: c.ink2, lineHeight: 1.7, maxWidth: 300 }}>
            {subtitle}
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div style={{ padding: '0 24px 52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {Array.from({ length: TOTAL }).map((_, i) => (
            <span key={i} style={{
              width: i === index ? 22 : 6, height: 6, borderRadius: 3,
              background: i === index ? accent : 'rgba(58,36,25,0.18)',
              transition: 'all 0.3s ease',
              display: 'block',
            }} />
          ))}
        </div>
        <button
          onClick={onNext}
          style={{
            height: 50, padding: '0 26px', borderRadius: 25,
            border: 'none', cursor: 'pointer',
            background: c.ink, color: 'var(--on-fill)',
            fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
            letterSpacing: 0.6,
            display: 'inline-flex', alignItems: 'center', gap: 8,
          }}
        >
          {ctaLabel}
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 7h8m0 0L7.5 3.5M11 7l-3.5 3.5"
              stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ─── The five cards ────────────────────────────────────────────

type NavProps = { onSkip: () => void; onNext: () => void }

function Card01({ onSkip, onNext }: NavProps) {
  return (
    <CardShell
      index={0} bg={c.bg} accent={c.ink}
      eyebrow="01 / 05 · 想法"
      quote={<>Futari 不會問<br />誰花得比較多。</>}
      subtitle="我們只記下「發生了什麼」。誰先掏錢，是當下方便而已。"
      onSkip={onSkip} onNext={onNext}
      motif={
        <div style={{ position: 'relative' }}>
          <div style={{
            position: 'absolute', left: -90, top: -20, width: 360, height: 360,
            background: `radial-gradient(circle at 65% 35%, ${c.dawn} 0%, transparent 65%)`,
            filter: 'blur(8px)',
          }} />
          <div style={{ position: 'relative' }}>
            <Orbit size={240} ringColor={c.ink} ringOpacity={0.18} sunFill={c.ink} moonFill={c.ink} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TwoLeaves size={86} ink={c.ink} accent={c.ink} />
            </div>
          </div>
        </div>
      }
    />
  )
}

// Two-tone split — ink and coral fields meet at a soft meridian
function Card02({ onSkip, onNext }: NavProps) {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: `linear-gradient(180deg, ${c.bg} 0%, ${c.bg} 38%, ${c.accentSoft} 38%, ${c.accentSoft} 100%)`,
      }} />
      <CardShell
        index={1} bg="transparent" accent={c.accent}
        eyebrow="02 / 05 · 一起"
        quote={<>進到 Futari 的，<br />就是我們<em style={{ fontStyle: 'italic', color: c.accent }}>共同的</em>。</>}
        subtitle="這不是一本分帳簿。它是兩個人共有的家計簿 — 一筆進來，兩個人都看得到。"
        onSkip={onSkip} onNext={onNext}
        motif={
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: -200, right: -200, top: 180, height: 1, background: 'rgba(58,36,25,0.10)' }} />
            <TwoLeaves size={180} ink={c.ink} accent={c.accent} />
          </div>
        }
      />
    </div>
  )
}

// Sun rising — the orbit's sun marker scaled large
function Card03({ onSkip, onNext }: NavProps) {
  return (
    <CardShell
      index={2} bg={c.bg} accent={c.accent}
      eyebrow="03 / 05 · 儀式"
      quote={<>薪水進來的那天，<br />是兩個人一起<br />感受的時刻。</>}
      subtitle="所以定期收入會在那一天出現一張卡 — 提醒我們、被一起確認。"
      onSkip={onSkip} onNext={onNext}
      motif={
        <div style={{ position: 'relative', width: 320, height: 320 }}>
          <div style={{
            position: 'absolute', top: 30, right: 40, width: 180, height: 180,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${c.accent} 0%, ${c.accent} 38%, ${c.accentSoft} 60%, transparent 78%)`,
          }} />
          <svg width="320" height="320" viewBox="0 0 320 320" style={{ position: 'absolute', inset: 0 }}>
            <path d="M 30 220 A 130 130 0 0 1 290 220"
              stroke={c.ink} strokeOpacity="0.22" strokeWidth="1.2"
              strokeDasharray="2 4" fill="none" />
          </svg>
          <div style={{ position: 'absolute', left: 130, top: 188 }}>
            <TwoLeaves size={64} ink={c.ink} accent={c.accent} />
          </div>
          <div style={{
            position: 'absolute', top: 38, right: 220,
            fontFamily: 'ui-monospace, monospace',
            fontSize: 10, color: c.ink2, opacity: 0.6, letterSpacing: 1.5,
          }}>
            05 / 月
          </div>
        </div>
      }
    />
  )
}

// Sage halo — insurance reframed as promise
function Card04({ onSkip, onNext }: NavProps) {
  return (
    <CardShell
      index={3} bg={c.bg} accent={c.sage}
      eyebrow="04 / 05 · 守護"
      quote={<>保險不是費用 —<br />是和對方一起<br />守護的承諾。</>}
      subtitle="所以它放在「愛物」，不在支出裡。每一期繳費，都是再講一次這個承諾。"
      onSkip={onSkip} onNext={onNext}
      motif={
        <div style={{ position: 'relative' }}>
          <div style={{
            position: 'absolute', left: -30, top: -30, width: 280, height: 280,
            borderRadius: '50%', background: c.sageSoft, opacity: 0.65,
          }} />
          <div style={{
            position: 'absolute', left: 10, top: 10, width: 200, height: 200,
            borderRadius: '50%', background: c.sageSoft, opacity: 0.85,
          }} />
          <svg width="220" height="220" viewBox="0 0 220 220" style={{ position: 'relative' }}>
            <circle cx="110" cy="110" r="98" stroke={c.sage} strokeWidth="0.8" fill="none"
              strokeDasharray="1.2 3" opacity="0.35" />
            <circle cx="110" cy="110" r="78" stroke={c.sage} strokeWidth="0.8" fill="none"
              strokeDasharray="1.2 3" opacity="0.45" />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TwoLeaves size={94} ink={c.ink} accent={c.accent} />
          </div>
        </div>
      }
    />
  )
}

// Both colors meet — CTA
function Card05({ onSkip, onNext }: NavProps) {
  return (
    <CardShell
      index={4} bg={c.bg} accent={c.ink}
      eyebrow="05 / 05 · 開始"
      quote={<>準備好了嗎？<br />就從第一筆<br />慢慢開始。</>}
      subtitle="不用等到完美的時刻 — 帳本會陪著你們一起長出來。"
      ctaLabel="開始記第一筆"
      onSkip={onSkip} onNext={onNext}
      motif={
        <div style={{ position: 'relative' }}>
          <div style={{
            position: 'absolute', left: -120, top: -40, width: 360, height: 360,
            background: `radial-gradient(circle at 30% 30%, ${c.dawn} 0%, transparent 55%), radial-gradient(circle at 70% 70%, ${c.accentSoft} 0%, transparent 55%)`,
            filter: 'blur(4px)',
          }} />
          <div style={{ position: 'relative' }}>
            <Orbit size={240} ringColor={c.accent} ringOpacity={0.45} sunFill={c.accent} moonFill={c.ink} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TwoLeaves size={94} ink={c.ink} accent={c.accent} />
            </div>
          </div>
        </div>
      }
    />
  )
}

// ─── Main controller ───────────────────────────────────────────

export default function PhilosophyCards() {
  const router = useRouter()
  const [index, setIndex] = useState(-1) // -1 = checking localStorage

  useEffect(() => {
    if (localStorage.getItem(PHILOSOPHY_SEEN_KEY) === 'true') {
      router.replace('/setup')
    } else {
      setIndex(0)
    }
  }, [router])

  const proceed = () => {
    localStorage.setItem(PHILOSOPHY_SEEN_KEY, 'true')
    router.push('/setup')
  }

  const onNext = () => {
    if (index >= TOTAL - 1) {
      proceed()
    } else {
      setIndex(i => i + 1)
    }
  }

  if (index < 0) return null

  const navProps = { onSkip: proceed, onNext }
  const cards = [
    <Card01 key={0} {...navProps} />,
    <Card02 key={1} {...navProps} />,
    <Card03 key={2} {...navProps} />,
    <Card04 key={3} {...navProps} />,
    <Card05 key={4} {...navProps} />,
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, background: c.bg, overflow: 'hidden' }}>
      <style>{`
        @keyframes cardIn {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0);    }
        }
      `}</style>
      <div style={{
        position: 'relative',
        maxWidth: 448,
        height: '100%',
        margin: '0 auto',
        overflow: 'hidden',
      }}>
        <div key={index} style={{ position: 'absolute', inset: 0, animation: 'cardIn 0.28s ease' }}>
          {cards[index]}
        </div>
      </div>
    </div>
  )
}
