'use client'

import { useState } from 'react'
import { useInstallPrompt } from '@/lib/hooks/useInstallPrompt'
import type { Translations } from '@/lib/i18n/locales/zh-TW'

interface Props {
  t: Translations['signIn']['installHint']
}

/**
 * Quiet secondary entry below the OAuth button on /sign-in. Lets visitors
 * who aren't ready to sign in yet still add Futari to their home screen.
 *
 * - Android: triggers the captured `beforeinstallprompt` dialog directly.
 * - iOS: expands an inline two-step guide (Share → Add to Home Screen),
 *   since iOS has no programmatic install API.
 * - Desktop / unknown / already-standalone: renders nothing — installing
 *   from a sign-in page only makes sense on mobile.
 */
export function InstallHint({ t }: Props) {
  const { platform, standalone, canPromptInstall, promptInstall } = useInstallPrompt()
  const [iosExpanded, setIosExpanded] = useState(false)

  if (standalone) return null

  const isIos = platform === 'ios-safari' || platform === 'ios-other'
  const isAndroid = platform === 'android'

  if (!isIos && !(isAndroid && canPromptInstall)) return null

  const handleClick = () => {
    if (isAndroid) {
      void promptInstall()
      return
    }
    setIosExpanded((prev) => !prev)
  }

  return (
    <div className="w-full flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={handleClick}
        className="bg-transparent border-0 p-1 text-xs cursor-pointer inline-flex items-center gap-1"
        style={{ color: 'var(--ink-3)' }}
        aria-expanded={isIos ? iosExpanded : undefined}
      >
        <span>{t.cta}</span>
        <span aria-hidden="true">{iosExpanded ? '↓' : '↗'}</span>
      </button>

      {isIos && iosExpanded && (
        <div
          className="w-full rounded-2xl px-4 py-3 flex flex-col gap-2.5"
          style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
        >
          <IosStep n={1} text={t.iosStep1} icon={<ShareIcon />} />
          <IosStep n={2} text={t.iosStep2} icon={<HomeIcon />} />
        </div>
      )}
    </div>
  )
}

function IosStep({ n, text, icon }: { n: number; text: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 text-xs leading-snug" style={{ color: 'var(--ink-2)' }}>
      <span
        className="shrink-0 w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px] font-semibold tnum"
        style={{ background: 'var(--accent-soft)', color: 'var(--ink)', fontFamily: 'var(--font-numeric)' }}
      >
        {n}
      </span>
      <span className="flex-1">{text}</span>
      <span aria-hidden="true" style={{ color: 'var(--ink-3)' }}>{icon}</span>
    </div>
  )
}

function ShareIcon() {
  return (
    <svg width="14" height="16" viewBox="0 0 18 22" fill="none" aria-hidden="true">
      <path d="M9 14V3M9 3L5.5 6.5M9 3L12.5 6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 11v6.5a2 2 0 002 2h8a2 2 0 002-2V11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function HomeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M3 8.5L9 3l6 5.5V15a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 013 15V8.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M7 16.5v-4h4v4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}
