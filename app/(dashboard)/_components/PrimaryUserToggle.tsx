'use client'

import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { useTranslations } from '@/lib/i18n/client'

interface PrimaryUserToggleProps {
  value: string | null  // user UUID or null (shared)
  onChange: (value: string | null) => void
  /** #1589 — no segment selected (the stored primary user left the ledger).
   *  `value` null would otherwise show 共用 as selected. */
  unresolved?: boolean
  /** id of the hint shown under the toggle while unresolved. */
  describedBy?: string
}

/**
 * 3-segment toggle: viewer / partner / shared. Uses MemberContext to resolve viewer/partner.
 * Solo mode (no partner): renders nothing — caller should not display the row.
 */
export function PrimaryUserToggle({ value, onChange, unresolved = false, describedBy }: PrimaryUserToggleProps) {
  const { viewer, partner } = useMember()
  const t = useTranslations()

  if (!partner) return null  // solo mode

  const opts: Array<{ v: string | null; label: string }> = [
    { v: viewer.id, label: t.common.me },
    { v: partner.id, label: partner.displayName ?? t.common.partner },
    { v: null, label: t.common.shared },
  ]

  return (
    <div
      className="flex gap-1 rounded-xl p-1"
      style={{ background: 'var(--toggle-segment-track)' }}
      aria-describedby={describedBy}
    >
      {opts.map(opt => {
        const sel = !unresolved && value === opt.v
        return (
          <button
            key={opt.v ?? 'shared'}
            type="button"
            onClick={() => onChange(opt.v)}
            className={`oik-segment flex-1 h-9 rounded-lg text-sm font-medium ${
              sel ? 'font-medium' : ''
            }`}
            style={{
              background: sel ? 'var(--toggle-segment-thumb)' : 'transparent',
              color: sel ? 'var(--ink)' : 'var(--ink-2)',
              boxShadow: sel ? 'var(--toggle-segment-thumb-shadow)' : 'none',
              transition: `background var(--toggle-transition), color var(--toggle-transition), box-shadow var(--toggle-transition)`,
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
