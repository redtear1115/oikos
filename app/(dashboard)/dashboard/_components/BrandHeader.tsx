'use client'

import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { FutariMark } from '@/app/(dashboard)/_components/FutariMark'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'

export function BrandHeader() {
  const { group, viewer, partner } = useMember()
  return (
    <div className="flex items-center justify-between px-5 pt-[60px] pb-0">
      <div className="flex items-center gap-[10px]">
        <FutariMark size={36} />
        <div className="text-[19px] font-medium tracking-tight"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}>
          {group.name}
        </div>
      </div>
      <div className="flex">
        <Avatar who="M" initial={viewer.initial} size={26} />
        {partner && (
          <div className="-ml-[7px]">
            <Avatar who="T" initial={partner.initial} size={26} ring />
          </div>
        )}
      </div>
    </div>
  )
}
