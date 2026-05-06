'use client'

import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'

interface PayerToggleProps {
  value: 'M' | 'T'
  onChange: (who: 'M' | 'T') => void
}

export function PayerToggle({ value, onChange }: PayerToggleProps) {
  const { viewer, partner } = useMember()

  return (
    <div
      className="mt-[22px] flex items-center justify-center gap-2.5 text-label"
      style={{ color: 'var(--ink-2)' }}
    >
      <span>誰付的？</span>
      <div
        className="inline-flex rounded-full p-[3px] gap-0.5"
        style={{ background: 'rgba(31,27,22,0.05)' }}
      >
        {(['M', 'T'] as const).map((w) => (
          <button
            key={w}
            onClick={() => onChange(w)}
            className="h-7 px-3.5 rounded-full border-0 text-label font-medium cursor-pointer flex items-center gap-1.5 transition-all duration-150"
            style={{
              background: value === w ? 'var(--surface)' : 'transparent',
              color: value === w ? 'var(--ink)' : 'var(--ink-2)',
              boxShadow: value === w ? '0 1px 3px rgba(31,27,22,0.10)' : 'none',
            }}
          >
            <Avatar
              who={w}
              initial={w === 'M' ? viewer.initial : partner?.initial ?? '?'}
              src={w === 'M' ? viewer.avatarUrl : partner?.avatarUrl ?? null}
              size={18}
            />
            {w === 'M' ? '我' : '對方'}
          </button>
        ))}
      </div>
    </div>
  )
}
