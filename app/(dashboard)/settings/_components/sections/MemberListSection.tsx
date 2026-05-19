'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { createInvite } from '@/actions/invite'
import { shareInviteLink } from '@/lib/share'
import { useTranslations } from '@/lib/i18n/client'
import { describeError } from '@/lib/errors'

interface MemberRowData {
  memberRole: 'a' | 'b'
  initial: string
  avatarUrl: string | null
  displayName: string
  email: string
}

interface Props {
  viewer: MemberRowData
  /** Null in solo mode — invite CTA replaces the second row. */
  partner: MemberRowData | null
  /** Group id — needed only for invite link generation in solo mode. */
  groupId: string
}

export function MemberListSection({ viewer, partner, groupId }: Props) {
  const t = useTranslations()
  const isSolo = partner === null

  const [invitePending, startInviteTransition] = useTransition()
  const [inviteToast, setInviteToast] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const inviteToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (inviteToastTimerRef.current) clearTimeout(inviteToastTimerRef.current)
  }, [])

  const handleInvite = () => {
    setInviteError(null)
    startInviteTransition(async () => {
      try {
        const url = await createInvite(groupId)
        const result = await shareInviteLink(url)
        setInviteToast(result === 'shared' ? t.soloBanner.sharedAndCopied : t.soloBanner.copied)
        if (inviteToastTimerRef.current) clearTimeout(inviteToastTimerRef.current)
        inviteToastTimerRef.current = setTimeout(() => setInviteToast(null), 2000)
      } catch (e) {
        setInviteError(describeError(e, t.common.error, t.common.offlineError))
      }
    })
  }

  return (
    <>
      <div
        className="rounded-card overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
      >
        <MemberRow {...viewer} youSuffix />
        {partner && (
          <>
            <div style={{ borderTop: '1px solid var(--hairline)' }} />
            <MemberRow {...partner} />
          </>
        )}
      </div>
      {isSolo && (
        <div className="mt-3">
          <button
            type="button"
            onClick={handleInvite}
            disabled={invitePending}
            className="w-full h-12 rounded-bubble border-0 text-sm font-semibold cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--btn-accent-bg)', color: 'var(--btn-accent-text)' }}
          >
            {invitePending ? t.soloBanner.generating : t.settings.inviteCta}
          </button>
          {inviteToast && (
            <div className="text-xs mt-2 px-1 text-center" style={{ color: 'var(--ink-2)' }}>
              {inviteToast}
            </div>
          )}
          {inviteError && (
            <div className="text-xs mt-2 px-1 text-center" style={{ color: 'var(--debit)' }}>
              {inviteError}
            </div>
          )}
        </div>
      )}
    </>
  )
}

function MemberRow({
  memberRole, initial, avatarUrl, displayName, email, youSuffix,
}: MemberRowData & { youSuffix?: boolean }) {
  const t = useTranslations()
  return (
    <div className="flex items-center gap-3.5 px-5 py-4">
      <Avatar memberRole={memberRole} initial={initial} src={avatarUrl} size={40} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
          {displayName}{youSuffix && <span className="ml-1" style={{ color: 'var(--ink-3)' }}>{t.settings.youSuffix}</span>}
        </div>
        {email && (
          <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--ink-3)' }}>{email}</div>
        )}
      </div>
    </div>
  )
}
