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

function PaperPlaneIcon({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M22 2L11 13" />
      <path d="M22 2L15 22L11 13L2 9L22 2Z" />
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
            <PaperPlaneIcon size={14} color="var(--ink-2)" />
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
