'use client'

import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { FutariMark } from '@/app/(dashboard)/_components/FutariMark'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'

export function BrandHeader() {
  const { group, viewer, partner, viewerIsA } = useMember()
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
      <div className="flex shrink-0">
        <Avatar memberRole={viewerRole} initial={viewer.initial} src={viewer.avatarUrl} size={26} />
        {partner && (
          <div className="-ml-[7px]">
            <Avatar memberRole={partnerRole} initial={partner.initial} src={partner.avatarUrl} size={26} ring />
          </div>
        )}
      </div>
    </div>
  )
}
