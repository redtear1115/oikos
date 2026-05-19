'use client'

import { useEffect, useState } from 'react'
import { SheetFrame } from './SheetFrame'
import { SheetBody } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { getPlatform, type Platform } from '@/lib/install-guide'
import type { Translations } from '@/lib/i18n/locales/zh-TW'

interface Props {
  open: boolean
  onClose: () => void
  t: Translations
}

/**
 * Platform-aware bottom sheet that walks the user through "Add to Home Screen".
 * Used in two places:
 *   1. Auto-shown after first /setup completion (if not already a PWA)
 *   2. Reopenable from /settings → 加到主畫面
 */
export function InstallGuide({ open, onClose, t }: Props) {
  // Detect on open (not on mount) so SSR doesn't render platform-specific UI.
  const [platform, setPlatform] = useState<Platform>('unknown')
  useEffect(() => {
    if (open) setPlatform(getPlatform())
  }, [open])

  return (
    <SheetFrame open={open} onClose={onClose} ariaLabel={t.installGuide.title} topRadius={28}>
      {/* Header — 3-column layout (close | centred title | spacer); non-standard for SheetHeader primitive */}
      <div className="flex items-center justify-between px-5 pt-3 pb-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="p-1"
        >
          {t.installGuide.close}
        </Button>
        <div className="text-base font-semibold" style={{ color: 'var(--ink)' }}>
          {t.installGuide.title}
        </div>
        <div className="w-10" />
      </div>

      <SheetBody>
        <div className="pb-8">
          <p className="text-sm mb-6 leading-relaxed" style={{ color: 'var(--ink-2)' }}>
            {t.installGuide.intro}
          </p>

          {platform === 'ios-safari' && <IosSafariSteps t={t} />}
          {platform === 'ios-other' && <IosOtherSteps t={t} />}
          {platform === 'android' && <AndroidSteps t={t} />}
          {platform === 'desktop' && <DesktopSteps t={t} />}
          {platform === 'unknown' && <FallbackSteps t={t} />}
        </div>
      </SheetBody>
    </SheetFrame>
  )
}

/* -------------------- Platform-specific steps -------------------- */

function IosSafariSteps({ t }: { t: Translations }) {
  return (
    <Steps>
      <Step n={1}>
        {t.installGuide.iosSafari.step1} <ShareIcon />
      </Step>
      <Step n={2}>
        <span dangerouslySetInnerHTML={{ __html: t.installGuide.iosSafari.step2Html }} /> <HomeIcon />
      </Step>
      <Step n={3}>
        <span dangerouslySetInnerHTML={{ __html: t.installGuide.iosSafari.step3Html }} />
      </Step>
    </Steps>
  )
}

function IosOtherSteps({ t }: { t: Translations }) {
  const url = typeof window !== 'undefined' ? window.location.origin : ''
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }
  return (
    <>
      <p
        className="text-sm mb-5 leading-relaxed"
        style={{ color: 'var(--ink-2)' }}
        dangerouslySetInnerHTML={{ __html: t.installGuide.iosOther.bodyHtml }}
      />
      <div
        className="rounded-bubble p-3 flex items-center gap-3 mb-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
      >
        <div className="flex-1 text-xs break-all" style={{ color: 'var(--ink-2)' }}>
          {url}
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={handleCopy}
          className="shrink-0"
        >
          {copied ? t.installGuide.iosOther.copied : t.installGuide.iosOther.copy}
        </Button>
      </div>
    </>
  )
}

function AndroidSteps({ t }: { t: Translations }) {
  return (
    <Steps>
      <Step n={1}>
        {t.installGuide.android.step1} <DotsIcon />
      </Step>
      <Step n={2}>
        <span dangerouslySetInnerHTML={{ __html: t.installGuide.android.step2Html }} />
      </Step>
      <Step n={3}>
        {t.installGuide.android.step3}
      </Step>
    </Steps>
  )
}

function DesktopSteps({ t }: { t: Translations }) {
  return (
    <Steps>
      <Step n={1}>
        {t.installGuide.desktop.step1} <InstallIcon />
      </Step>
      <Step n={2}>
        {t.installGuide.desktop.step2}
      </Step>
      <Step n={3}>
        {t.installGuide.desktop.step3}
      </Step>
    </Steps>
  )
}

function FallbackSteps({ t }: { t: Translations }) {
  return (
    <p
      className="text-sm leading-relaxed"
      style={{ color: 'var(--ink-2)' }}
      dangerouslySetInnerHTML={{ __html: t.installGuide.fallbackHtml }}
    />
  )
}

/* -------------------- Building blocks -------------------- */

function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="flex flex-col gap-4 list-none p-0 m-0">{children}</ol>
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <div
        className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold tnum"
        style={{
          background: 'var(--accent-soft)',
          color: 'var(--ink)',
          fontFamily: 'var(--font-numeric)',
        }}
      >
        {n}
      </div>
      <div
        className="flex-1 pt-1 text-sm leading-relaxed flex items-center flex-wrap gap-1.5"
        style={{ color: 'var(--ink)' }}
      >
        {children}
      </div>
    </li>
  )
}

/* -------------------- Inline icons -------------------- */

function ShareIcon() {
  return (
    <svg width="18" height="22" viewBox="0 0 18 22" fill="none" aria-hidden="true" className="inline-block align-middle">
      <path d="M9 14V3M9 3L5.5 6.5M9 3L12.5 6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 11v6.5a2 2 0 002 2h8a2 2 0 002-2V11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function HomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" className="inline-block align-middle">
      <path d="M3 8.5L9 3l6 5.5V15a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 013 15V8.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M7 16.5v-4h4v4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

function DotsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true" className="inline-block align-middle">
      <circle cx="9" cy="3.5" r="1.6" />
      <circle cx="9" cy="9" r="1.6" />
      <circle cx="9" cy="14.5" r="1.6" />
    </svg>
  )
}

function InstallIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" className="inline-block align-middle">
      <rect x="2" y="2.5" width="14" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9 6v6M6 9h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
