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
const REMOVED_KEY_PREFIX = 'futari_partner_removed_'

type Variant = 'hidden' | 'left' | 'removed'

/**
 * One-shot card surfaced on the stayer's dashboard the first time they open
 * the app after the partner leaves. SSR detection (`PartnerLeftCard` is only
 * rendered when the prior epoch had a partner and the current is solo); this
 * client component just gates on a localStorage dismissal flag.
 *
 * Two variants behind the same SSR condition (#1121). `removePartner` produces
 * the identical epoch shape as the partner leaving — closed duo epoch, open
 * solo epoch — so the server cannot distinguish "they left" from "I removed
 * them". `RemovePartnerFlow` writes an epoch-keyed flag on success and the
 * removal variant reads it. Without it, the person who just typed a confirm
 * string to remove someone is told that someone left them.
 */
export function PartnerLeftCard({ partnerName, currentEpochId }: Props) {
  const t = useTranslations()
  const [variant, setVariant] = useState<Variant>('hidden')  // hidden until we read storage

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.localStorage.getItem(DISMISS_KEY_PREFIX + currentEpochId) === '1') return
    const removed = window.localStorage.getItem(REMOVED_KEY_PREFIX + currentEpochId) === '1'
    setVariant(removed ? 'removed' : 'left')
  }, [currentEpochId])

  if (variant === 'hidden') return null

  const removed = variant === 'removed'
  const heading = removed
    ? t.postLeave.removedPartnerHeading
    : t.postLeave.partnerLeftHeading.replace('{partner}', partnerName)
  const body = removed ? t.postLeave.removedPartnerBody : t.postLeave.partnerLeftBody

  const handleDismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY_PREFIX + currentEpochId, '1')
      // The removal marker is one-shot — the dismissal flag above is what
      // keeps the card down from here, so clear it rather than leaving a
      // stale key behind for this epoch.
      window.localStorage.removeItem(REMOVED_KEY_PREFIX + currentEpochId)
    } catch {
      // localStorage can throw in private mode; failing to persist just means
      // the card re-shows on next open, which is acceptable.
    }
    setVariant('hidden')
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
            {heading}
          </div>
          <p className="text-sm mt-1.5 leading-relaxed" style={{ color: 'var(--ink-2)' }}>
            {body}
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
