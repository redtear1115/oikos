'use client'

import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { useAvatarMenu } from '@/app/(dashboard)/_components/AvatarMenuProvider'
import { FutariMark } from '@/app/(dashboard)/_components/FutariMark'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { useTranslations } from '@/lib/i18n/client'

interface BrandHeaderProps {
  showTripButton?: boolean
  onTripClick?: () => void
}

function JetIcon({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      aria-hidden
    >
      <path d="M21 14l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5v4.5L7 19.5V21l5-1.5L17 21v-1.5L13 18v-4.5l8 2.5z" />
    </svg>
  )
}

export function BrandHeader({ showTripButton, onTripClick }: BrandHeaderProps = {}) {
  const { group, viewer, partner, viewerIsA } = useMember()
  const { open } = useAvatarMenu()
  const t = useTranslations()
  const viewerRole = viewerIsA ? 'a' : 'b'
  const partnerRole = viewerIsA ? 'b' : 'a'

  return (
    <div className="flex items-center justify-between gap-3 px-5 pt-[max(env(safe-area-inset-top),24px)] pb-2">
      <div className="flex items-center gap-[10px] min-w-0 flex-1">
        <FutariMark size={36} />
        <div className="text-title font-medium tracking-tight truncate"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}>
          {group.name}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {showTripButton && (
          <button
            type="button"
            onClick={onTripClick}
            aria-label={t.dashboard.activeTripBanner.addAriaLabel}
            className="h-8 w-8 rounded-full flex items-center justify-center cursor-pointer"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--hairline)',
            }}
          >
            <JetIcon size={14} color="var(--ink-2)" />
          </button>
        )}
        <button
          type="button"
          onClick={open}
          aria-label={t.settings.quickAccessRow}
          className="flex bg-transparent border-0 p-1 -mr-1 cursor-pointer rounded-full"
        >
          <Avatar memberRole={viewerRole} initial={viewer.initial} src={viewer.avatarUrl} size={26} />
          {partner && (
            <div className="-ml-[7px]">
              <Avatar memberRole={partnerRole} initial={partner.initial} src={partner.avatarUrl} size={26} ring />
            </div>
          )}
        </button>
      </div>
    </div>
  )
}
