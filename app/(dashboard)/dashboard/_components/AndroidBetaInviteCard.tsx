'use client'

import { useEffect, useState } from 'react'
import { track } from '@/lib/analytics/track'
import { useTranslations } from '@/lib/i18n/client'
import { getPlatform } from '@/lib/install-guide'
import { detectPlatform } from '@/lib/platform'
import { ANDROID_BETA_FORM_URL } from '@/lib/visitorPlatform'

/** Global, one-time: the invite is about the device, not about a ledger or chapter. */
const DISMISS_KEY = 'futari_android_beta_invite_dismissed'

/**
 * One-time invite for Android *web* users (browser or installed PWA) to join
 * the Play closed test (#1553: Play wants real testers before production
 * access). Never on iOS, desktop or inside the Capacitor shell: the shell user
 * already has the app, so the invite would be asking for something done.
 *
 * Hidden on first render and decided in an effect, so server HTML and the
 * first client render agree. A failing `localStorage` (private mode) reads as
 * "not dismissed": the worst case is the card showing again next visit.
 *
 * TEMPORARY: remove this card, the `androidBetaInvite` i18n namespace and the
 * `android_beta_invite_*` events once Play production access is granted.
 */
export function AndroidBetaInviteCard() {
  const t = useTranslations()
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!ANDROID_BETA_FORM_URL) return
    if (getPlatform() !== 'android') return
    if (detectPlatform() === 'android_native') return
    try {
      if (window.localStorage.getItem(DISMISS_KEY)) return
    } catch {
      // unreadable storage: fall through and show
    }
    setShow(true)
    track('android_beta_invite_shown')
  }, [])

  if (!show) return null

  const markDismissed = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // private-mode storage failure: the card may show again next time.
    }
    setShow(false)
  }

  const handleDismiss = () => {
    track('android_beta_invite_dismissed')
    markDismissed()
  }

  // Signing up is the answer to the invite, so a click retires the card too.
  const handleCta = () => {
    track('android_beta_invite_clicked')
    markDismissed()
  }

  return (
    <div className="px-5 pt-4">
      <div
        className="rounded-card px-5 py-4 flex items-start gap-3"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--hairline)',
        }}
        role="status"
      >
        <div className="flex-1">
          <div
            className="text-base leading-tight"
            style={{ fontFamily: 'var(--font-fraunces)', color: 'var(--ink)', fontWeight: 500 }}
          >
            {t.androidBetaInvite.heading}
          </div>
          <p className="text-sm mt-1.5 leading-relaxed" style={{ color: 'var(--ink-2)' }}>
            {t.androidBetaInvite.body}
          </p>
          <a
            href={ANDROID_BETA_FORM_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleCta}
            className="inline-block text-sm mt-2 underline underline-offset-4"
            style={{ color: 'var(--ink)' }}
          >
            {t.androidBetaInvite.cta}
          </a>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label={t.postLeave.dismissAria}
          // Bare ✕ glyph, ~14px; ::before pads the hit area to ~46px (#1197).
          className="relative text-sm leading-none cursor-pointer self-start before:absolute before:-inset-4 before:content-['']"
          style={{ background: 'transparent', border: 'none', color: 'var(--ink-3)' }}
        >
          ✕
        </button>
      </div>
    </div>
  )
}
