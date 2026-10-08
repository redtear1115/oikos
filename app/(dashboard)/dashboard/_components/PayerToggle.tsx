'use client'

import { useId } from 'react'
import { useMember, whoToMemberRole } from '@/app/(dashboard)/_components/MemberContext'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { useTranslations } from '@/lib/i18n/client'
import { onRadioGroupKeyDown, rovingTabIndex } from '@/app/(dashboard)/_components/radioGroup'

interface PayerToggleProps {
  value: 'M' | 'T'
  onChange: (who: 'M' | 'T') => void
  /** #1588 — no segment selected: the stored payer left the ledger and the
   *  user has to pick again. `value` is ignored while this is set. */
  unresolved?: boolean
  /** id of the hint shown under the toggle while unresolved. */
  describedBy?: string
}

export function PayerToggle({ value, onChange, unresolved = false, describedBy }: PayerToggleProps) {
  const { viewer, partner, viewerIsA } = useMember()
  const t = useTranslations()
  const labelId = useId()

  // Selection is exposed as radio state, not only as the thumb colour: this
  // control decides who paid, and a screen reader used to announce both
  // segments identically ("我, button" / "對方, button") — picking the wrong
  // one silently flips the direction of the whole record (#1186).
  return (
    <div
      className="mt-[22px] flex items-center justify-center gap-2.5 text-sm"
      style={{ color: 'var(--ink-2)' }}
    >
      <span id={labelId}>{t.payerToggle.label}</span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        onKeyDown={onRadioGroupKeyDown}
        className="inline-flex rounded-full p-[3px] gap-0.5"
        style={{ background: 'var(--toggle-segment-track)' }}
      >
        {(['M', 'T'] as const).map((w) => {
          const sel = !unresolved && value === w
          return (
          // Visible segment stays h-7; the ::before extends the tap area to
          // 44px vertically (h-7 + 2×8px) without moving layout — same trick
          // as MonthSwitcher / BalanceHero (#147).
          <button
            key={w}
            type="button"
            role="radio"
            aria-checked={sel}
            tabIndex={rovingTabIndex(sel, w === 'M', !unresolved)}
            onClick={() => onChange(w)}
            className="oik-segment relative min-h-7 px-3.5 rounded-full border-0 text-sm font-medium cursor-pointer flex items-center gap-1.5 before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']"
            style={{
              background: sel ? 'var(--toggle-segment-thumb)' : 'transparent',
              color: sel ? 'var(--ink)' : 'var(--ink-2)',
              boxShadow: sel ? 'var(--toggle-segment-thumb-shadow)' : 'none',
              transition: `background var(--toggle-transition), color var(--toggle-transition), box-shadow var(--toggle-transition)`,
            }}
          >
            {/* Decorative: the letter fallback would otherwise prefix the
                radio's name ("R 我"). `contents` keeps the flex layout. */}
            <span aria-hidden="true" className="contents">
              <Avatar
                memberRole={whoToMemberRole(w, viewerIsA)}
                initial={w === 'M' ? viewer.initial : partner?.initial ?? '?'}
                src={w === 'M' ? viewer.avatarUrl : partner?.avatarUrl ?? null}
                size={18}
              />
            </span>
            {w === 'M' ? t.common.me : t.common.partner}
          </button>
          )
        })}
      </div>
    </div>
  )
}
