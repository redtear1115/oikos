'use client'

import { useAvatarMenu } from '@/app/(dashboard)/_components/AvatarMenuProvider'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { useTranslations } from '@/lib/i18n/client'

interface Props {
  viewerIsMemberA: boolean
  viewerDisplayName: string
  viewerAvatarUrl: string | null
  partner: { displayName: string; avatarUrl: string | null } | null
}

/** Entry row to the avatar quick-settings sheet — the Settings page's inline
 * equivalent of tapping the dashboard avatar cluster. */
export function QuickAccessRow({
  viewerIsMemberA,
  viewerDisplayName,
  viewerAvatarUrl,
  partner,
}: Props) {
  const t = useTranslations()
  const { open: openAvatarMenu } = useAvatarMenu()

  return (
    <div className="px-4 mt-2 mb-5">
      <button
        type="button"
        onClick={openAvatarMenu}
        className="w-full flex items-center justify-between px-5 py-4 rounded-[20px] text-left bg-transparent cursor-pointer"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
      >
        <div className="flex items-center gap-3">
          <div className="flex">
            <Avatar
              memberRole={viewerIsMemberA ? 'a' : 'b'}
              initial={viewerDisplayName[0]?.toUpperCase() ?? '?'}
              src={viewerAvatarUrl}
              size={22}
            />
            {partner && (
              <div className="-ml-[6px]">
                <Avatar
                  memberRole={viewerIsMemberA ? 'b' : 'a'}
                  initial={partner.displayName[0]?.toUpperCase() ?? '?'}
                  src={partner.avatarUrl}
                  size={22}
                  ring
                />
              </div>
            )}
          </div>
          <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            {t.settings.quickAccessRow}
          </div>
        </div>
        <span className="text-sm shrink-0" style={{ color: 'var(--ink-3)' }}>›</span>
      </button>
    </div>
  )
}
