'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from '@/lib/i18n/client'

interface Props {
  /** The leaver's brand-new solo group id. The localStorage flag is keyed off
   *  this so the card stays scoped to the post-leave moment, not future
   *  partner-joining sessions on the same group. */
  groupId: string
}

const FLAG_KEY_PREFIX = 'futari_just_left_'
const DISMISS_KEY_PREFIX = 'futari_welcome_solo_dismissed_'

/**
 * "歡迎回到一個人" card on the leaver's first dashboard render after they
 * leave a duo group. The "just left" flag is set client-side by
 * `LeaveGroupFlow` immediately after `leaveGroup` succeeds (server can't set
 * it because the new groupId only exists after the action returns and
 * before the navigation lands on /dashboard).
 */
export function WelcomeSoloCard({ groupId }: Props) {
  const t = useTranslations()
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const flag = window.localStorage.getItem(FLAG_KEY_PREFIX + groupId)
    if (!flag) return
    const dismissed = window.localStorage.getItem(DISMISS_KEY_PREFIX + groupId)
    if (dismissed) return
    setShow(true)
  }, [groupId])

  if (!show) return null

  const handleDismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY_PREFIX + groupId, '1')
      // The "just left" marker is one-shot — clear it on dismiss so it can't
      // re-fire on a later flow that re-keys the same group somehow.
      window.localStorage.removeItem(FLAG_KEY_PREFIX + groupId)
    } catch {
      // private-mode storage failure: the worst that happens is the card
      // re-shows next time. Acceptable.
    }
    setShow(false)
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
            {t.postLeave.welcomeSoloHeading}
          </div>
          <p className="text-sm mt-1.5 leading-relaxed" style={{ color: 'var(--ink-2)' }}>
            {t.postLeave.welcomeSoloBody}
          </p>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label={t.postLeave.dismissAria}
          className="text-sm leading-none cursor-pointer self-start"
          style={{ background: 'transparent', border: 'none', color: 'var(--ink-3)' }}
        >
          ✕
        </button>
      </div>
    </div>
  )
}
