'use client'

import { useEffect, useRef, useState } from 'react'
import type { Translations } from '@/lib/i18n/locales/zh-TW'
import { track } from '@/lib/analytics/track'

/**
 * How long the QR stays visible after the user taps "reveal", in ms.
 *
 * Security rationale (issue #1017): the invite token embedded in the QR URL
 * is a single-use entry ticket (valid for 24 h, `INVITE_TTL_MS`
 * in `lib/invite.ts`), and there is currently no way for the
 * group owner to remove a member who claims the slot (`leaveGroup` is
 * `only_member_b_can_leave` — see `actions/membership.ts`). Leaving the QR
 * on screen indefinitely would turn it into a standing public display of
 * that ticket. Tap-to-reveal + auto-hide keeps the exposure window short and
 * deliberate instead of ambient.
 */
const QR_VISIBLE_MS = 60_000

export default function InviteQr({
  url,
  t,
  groupId,
  onReveal,
}: {
  url: string
  t: Translations['setup']['invite']
  /** #1415 — join key so this pairs with server-side invite events. */
  groupId?: string
  /** Called after the QR is successfully rendered (not on failure). */
  onReveal?: () => void
}) {
  const [svg, setSvg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [])

  const scheduleAutoHide = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => setSvg(null), QR_VISIBLE_MS)
  }

  const handleReveal = async () => {
    setLoading(true)
    try {
      // Dynamic import: uqr must stay out of the setup route's initial bundle
      // since most invites are sent as a link, not scanned face-to-face.
      const { renderSVG } = await import('uqr')
      // `url` always comes from `createInvite` (actions/invite.ts) — never
      // arbitrary/user-supplied input — so feeding this generated markup to
      // dangerouslySetInnerHTML below is safe.
      const markup = renderSVG(url, { ecc: 'M', border: 2 })
      setSvg(markup)
      scheduleAutoHide()
      track('invite_qr_revealed', { group_id: groupId })
      onReveal?.()
    } finally {
      setLoading(false)
    }
  }

  const handleHide = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    setSvg(null)
  }

  if (!svg) {
    return (
      <button
        type="button"
        onClick={handleReveal}
        disabled={loading}
        className="oik-btn h-12 rounded-xl border border-hairline bg-surface text-ink text-sm font-medium cursor-pointer disabled:opacity-50"
      >
        {t.qrReveal}
      </button>
    )
  }

  return (
    <div className="rounded-2xl border border-hairline bg-surface p-4 flex flex-col items-center gap-3">
      {/*
        The QR stays pure black-on-white in every theme. uqr's renderSVG paints
        its own `<rect fill="white">` behind the modules, so the code keeps full
        contrast even when this card's surface token goes dark — that background
        rect is load-bearing for dark-mode scannability, not decoration.
        Scanners depend on that contrast; recolouring the modules to brand or
        theme tokens would hurt them. Deliberate — do not "fix" it to follow the
        app's palette.
      */}
      <div
        role="img"
        aria-label={t.qrAlt}
        className="w-full max-w-60 [&>svg]:w-full [&>svg]:h-auto [&>svg]:block motion-safe:transition-opacity motion-safe:duration-200"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <button
        type="button"
        onClick={handleHide}
        className="oik-btn h-9 px-4 rounded-lg border-0 bg-surface-alt text-ink-2 text-sm cursor-pointer"
      >
        {t.qrHide}
      </button>
    </div>
  )
}
