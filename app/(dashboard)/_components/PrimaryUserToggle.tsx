'use client'

import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { useTranslations } from '@/lib/i18n/client'

interface PrimaryUserToggleProps {
  value: string | null  // user UUID or null (shared)
  onChange: (value: string | null) => void
}

/**
 * 3-segment toggle: viewer / partner / shared. Uses MemberContext to resolve viewer/partner.
 * Solo mode (no partner): renders nothing — caller should not display the row.
 */
export function PrimaryUserToggle({ value, onChange }: PrimaryUserToggleProps) {
  const { viewer, partner } = useMember()
  const t = useTranslations()

  if (!partner) return null  // solo mode

  const opts: Array<{ v: string | null; label: string }> = [
    { v: viewer.id, label: t.common.me },
    { v: partner.id, label: partner.displayName ?? t.common.partner },
    { v: null, label: t.common.shared },
  ]

  return (
    <div className="flex gap-1 rounded-xl bg-[rgba(58,36,25,0.05)] p-1">
      {opts.map(opt => (
        <button
          key={opt.v ?? 'shared'}
          type="button"
          onClick={() => onChange(opt.v)}
          className={`flex-1 h-9 rounded-lg text-label font-medium transition-colors ${
            value === opt.v
              ? 'bg-white text-[var(--ink)] font-semibold shadow-sm'
              : 'bg-transparent text-[var(--ink-2)]'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
