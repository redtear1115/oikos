'use client'

import { useMember } from '@/app/(dashboard)/_components/MemberContext'

interface PrimaryUserToggleProps {
  value: string | null  // user UUID or null (共用)
  onChange: (value: string | null) => void
}

/**
 * 3-segment toggle: 我 / 對方 / 共用. Uses MemberContext to resolve viewer/partner.
 * Solo mode (no partner): renders nothing — caller should not display the row.
 */
export function PrimaryUserToggle({ value, onChange }: PrimaryUserToggleProps) {
  const { viewer, partner } = useMember()

  if (!partner) return null  // solo mode

  const opts: Array<{ v: string | null; label: string }> = [
    { v: viewer.id, label: '我' },
    { v: partner.id, label: partner.displayName ?? '對方' },
    { v: null, label: '共用' },
  ]

  return (
    <div className="flex gap-1 rounded-xl bg-[rgba(58,36,25,0.05)] p-1">
      {opts.map(opt => (
        <button
          key={opt.v ?? 'shared'}
          type="button"
          onClick={() => onChange(opt.v)}
          className={`flex-1 h-9 rounded-lg text-[13px] font-medium transition-colors ${
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
