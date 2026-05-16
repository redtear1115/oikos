'use client'

import { useMember } from './MemberContext'
import { Avatar } from './Avatar'
import { SheetBackdrop } from '@/app/(dashboard)/dashboard/_components/SheetBackdrop'
import type { AvatarMenuData } from './AvatarMenuProvider'

interface Props {
  open: boolean
  onClose: () => void
  data: AvatarMenuData
}

export function AvatarMenuSheet({ open, onClose, data: _data }: Props) {
  const { group, viewer, partner, viewerIsA } = useMember()
  const viewerRole = viewerIsA ? 'a' : 'b'
  const partnerRole = viewerIsA ? 'b' : 'a'

  return (
    <>
      <SheetBackdrop open={open} onClick={onClose} />
      <div
        className="fixed left-1/2 -translate-x-1/2 bottom-0 w-full max-w-md z-[100] flex flex-col overflow-hidden"
        style={{
          background: 'var(--bg)',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          boxShadow: '0 -10px 40px rgba(0,0,0,0.18)',
          maxHeight: 'calc(100dvh - max(env(safe-area-inset-top), 24px))',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)',
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        {/* Grabber */}
        <div className="pt-2 flex justify-center">
          <div className="w-9 h-[5px] rounded-full" style={{ background: 'rgba(31,27,22,0.18)' }} />
        </div>

        {/* Header: group name + avatar mini-cluster */}
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
          <div className="text-body font-semibold truncate" style={{ color: 'var(--ink)' }}>
            {group.name}
          </div>
          <div className="flex shrink-0">
            <Avatar memberRole={viewerRole} initial={viewer.initial} src={viewer.avatarUrl} size={22} />
            {partner && (
              <div className="-ml-[6px]">
                <Avatar memberRole={partnerRole} initial={partner.initial} src={partner.avatarUrl} size={22} ring />
              </div>
            )}
          </div>
        </div>

        {/* Scrollable body — sections wired in the next commit (#427). */}
        <div className="overflow-y-auto px-4 pb-[max(env(safe-area-inset-bottom),16px)]" />
      </div>
    </>
  )
}
