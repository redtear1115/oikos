'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from '@/lib/i18n/client'

interface Props {
  /** Display name of the partner who just left. */
  partnerName: string
  /**
   * The current (open) epoch id on the stayer's group. Used as the dismissal key
   * so a future leave (in a future epoch) re-shows the card.
   */
  currentEpochId: string
}

const DISMISS_KEY_PREFIX = 'futari_partner_left_'

/**
 * One-shot card surfaced on the stayer's dashboard the first time they open
 * the app after the partner leaves. SSR detection (`PartnerLeftCard` is only
 * rendered when the prior epoch had a partner and the current is solo); this
 * client component just gates on a localStorage dismissal flag.
 */
export function PartnerLeftCard({ partnerName, currentEpochId }: Props) {
  const t = useTranslations()
  const [hidden, setHidden] = useState(true)  // start hidden until we read storage

  useEffect(() => {
    const key = DISMISS_KEY_PREFIX + currentEpochId
    if (typeof window !== 'undefined' && window.localStorage.getItem(key) === '1') return
    setHidden(false)
  }, [currentEpochId])

  if (hidden) return null

  const handleDismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY_PREFIX + currentEpochId, '1')
    } catch {
      // localStorage can throw in private mode; failing to persist just means
      // the card re-shows on next open, which is acceptable.
    }
    setHidden(true)
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
            {t.postLeave.partnerLeftHeading.replace('{partner}', partnerName)}
          </div>
          <p className="text-sm mt-1.5 leading-relaxed" style={{ color: 'var(--ink-2)' }}>
            {t.postLeave.partnerLeftBody}
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
