'use client'

import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { useAvatarMenu } from '@/app/(dashboard)/_components/AvatarMenuProvider'
import { FutariMark } from '@/app/(dashboard)/_components/FutariMark'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { useTranslations } from '@/lib/i18n/client'
import { BrandHeaderHint } from './BrandHeaderHint'

interface BrandHeaderProps {
  showTripButton?: boolean
  onTripClick?: () => void
}

function PlaneIcon({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
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
      <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
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
      {/* relative: anchor for BrandHeaderHint absolute callouts */}
      <div className="relative flex items-center gap-2 shrink-0">
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
            <PlaneIcon size={14} color="var(--ink-2)" />
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
            <div className="-ml-2">
              <Avatar memberRole={partnerRole} initial={partner.initial} src={partner.avatarUrl} size={26} ring />
            </div>
          )}
        </button>
        <BrandHeaderHint showTripButton={!!showTripButton} />
      </div>
    </div>
  )
}
