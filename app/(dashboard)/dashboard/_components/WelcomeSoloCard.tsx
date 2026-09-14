'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from '@/lib/i18n/client'

interface Props {
  /**
   * The open epoch on the leaver's brand-new solo group. Both localStorage keys
   * below are built from it, so the card stays scoped to the post-leave chapter
   * and a later chapter on the same group starts clean.
   *
   * Epoch-keyed since #1125 (group-keyed before), matching its slot-mate
   * `PartnerLeftCard`. Nullable because `EpochWindow.epochId` is: the
   * defensive fallback in `lib/db/queries/epoch.ts` returns null when a group
   * has no epoch row at all. `group.id` never was, which is why the switch
   * needs the guard below.
   *
   * ⚠️ The #1125 switch dropped one cohort on the floor: anyone who left a
   * group shortly before that deploy still carries a `futari_just_left_<groupId>`
   * flag that nothing reads any more, so their one-shot welcome card silently
   * never appears. Bounded, no data loss, accepted deliberately.
   *
   * If someone reports the card missing, DO NOT add a group-keyed fallback
   * read to the effect below. That resurrects the stale-flag problem the
   * switch removed, and the effect is exactly where such a fallback would
   * get written.
   */
  epochId: string | null
}

const FLAG_KEY_PREFIX = 'futari_just_left_'
const DISMISS_KEY_PREFIX = 'futari_welcome_solo_dismissed_'

/**
 * "歡迎回到一個人" card on the leaver's first dashboard render after they
 * leave a duo group. The "just left" flag is set client-side by
 * `LeaveGroupFlow` immediately after `leaveGroup` succeeds (server can't set
 * it because the new epoch id only exists after the action returns and
 * before the navigation lands on /dashboard).
 *
 * Both keys are epoch-keyed (#1125). They moved together on purpose: the flag
 * lives in `LeaveGroupFlow`, the dismissal lives here, and re-keying one
 * without the other would make already-dismissed cards reappear.
 */
export function WelcomeSoloCard({ epochId }: Props) {
  const t = useTranslations()
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    // Guard, not a formality: concatenating a null `epochId` would build the
    // key `futari_just_left_null`, which every epoch-less group on the device
    // shares. Staying hidden is the safe read of "we don't know which chapter
    // this is". The failure it prevents is silent either way — no error, the
    // card just doesn't appear — so the choice is between "hidden on a group
    // that shouldn't exist post-migration" and "one group's dismissal hiding
    // another's card". First one.
    if (!epochId) return
    const flag = window.localStorage.getItem(FLAG_KEY_PREFIX + epochId)
    if (!flag) return
    const dismissed = window.localStorage.getItem(DISMISS_KEY_PREFIX + epochId)
    if (dismissed) return
    setShow(true)
  }, [epochId])

  if (!show || !epochId) return null

  const handleDismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY_PREFIX + epochId, '1')
      // The "just left" marker is one-shot — clear it on dismiss so it can't
      // re-fire on a later flow that re-keys the same epoch somehow.
      window.localStorage.removeItem(FLAG_KEY_PREFIX + epochId)
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
