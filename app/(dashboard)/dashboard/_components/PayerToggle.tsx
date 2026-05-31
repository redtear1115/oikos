'use client'

import { useMember, whoToMemberRole } from '@/app/(dashboard)/_components/MemberContext'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { useTranslations } from '@/lib/i18n/client'

interface PayerToggleProps {
  value: 'M' | 'T'
  onChange: (who: 'M' | 'T') => void
}

export function PayerToggle({ value, onChange }: PayerToggleProps) {
  const { viewer, partner, viewerIsA } = useMember()
  const t = useTranslations()

  return (
    <div
      className="mt-[22px] flex items-center justify-center gap-2.5 text-sm"
      style={{ color: 'var(--ink-2)' }}
    >
      <span>{t.payerToggle.label}</span>
      <div
        className="inline-flex rounded-full p-[3px] gap-0.5"
        style={{ background: 'var(--toggle-segment-track)' }}
      >
        {(['M', 'T'] as const).map((w) => (
          <button
            key={w}
            onClick={() => onChange(w)}
            className="oik-segment h-7 px-3.5 rounded-full border-0 text-sm font-medium cursor-pointer flex items-center gap-1.5"
            style={{
              background: value === w ? 'var(--toggle-segment-thumb)' : 'transparent',
              color: value === w ? 'var(--ink)' : 'var(--ink-2)',
              boxShadow: value === w ? 'var(--toggle-segment-thumb-shadow)' : 'none',
              transition: `background var(--toggle-transition), color var(--toggle-transition), box-shadow var(--toggle-transition)`,
            }}
          >
            <Avatar
              memberRole={whoToMemberRole(w, viewerIsA)}
              initial={w === 'M' ? viewer.initial : partner?.initial ?? '?'}
              src={w === 'M' ? viewer.avatarUrl : partner?.avatarUrl ?? null}
              size={18}
            />
            {w === 'M' ? t.common.me : t.common.partner}
          </button>
        ))}
      </div>
    </div>
  )
}
