'use client'

import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { useAvatarMenu } from '@/app/(dashboard)/_components/AvatarMenuProvider'
import { FutariMark } from '@/app/(dashboard)/_components/FutariMark'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { useTranslations } from '@/lib/i18n/client'

export function BrandHeader() {
  const { group, viewer, partner, viewerIsA } = useMember()
  const { open } = useAvatarMenu()
  const t = useTranslations()
  const viewerRole = viewerIsA ? 'a' : 'b'
  const partnerRole = viewerIsA ? 'b' : 'a'

  return (
    <div className="flex items-center justify-between gap-3 px-5 pt-[max(env(safe-area-inset-top),24px)] pb-0">
      <div className="flex items-center gap-[10px] min-w-0 flex-1">
        <FutariMark size={36} />
        <div className="text-title font-medium tracking-tight truncate"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}>
          {group.name}
        </div>
      </div>
      <button
        type="button"
        onClick={open}
        aria-label={t.settings.quickAccessRow}
        className="flex shrink-0 bg-transparent border-0 p-1 -mr-1 cursor-pointer rounded-full"
      >
        <Avatar memberRole={viewerRole} initial={viewer.initial} src={viewer.avatarUrl} size={26} />
        {partner && (
          <div className="-ml-[7px]">
            <Avatar memberRole={partnerRole} initial={partner.initial} src={partner.avatarUrl} size={26} ring />
          </div>
        )}
      </button>
    </div>
  )
}
