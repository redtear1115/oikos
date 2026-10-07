'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { ConfirmModal } from '@/app/(dashboard)/_components/ConfirmModal'
import { createInvite, revokeOpenInvites } from '@/actions/invite'
import { shareInviteLink } from '@/lib/share'
import { useTranslations } from '@/lib/i18n/client'
import { describeError } from '@/lib/errors'
import { unwrapAction } from '@/lib/action-errors'

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
  /**
   * #1546 — the ledger has an invite link that could still be accepted (read
   * by the server when the dashboard layout rendered). Turns on the "make the
   * link unusable" button; a link minted here turns it on too.
   */
  hasOpenInvite?: boolean
}

export function MemberListSection({ viewer, partner, hasOpenInvite = false }: Props) {
  const t = useTranslations()
  const router = useRouter()
  const isSolo = partner === null

  // Local knowledge beats the server prop once this section has minted or
  // revoked a link itself; until then the prop decides.
  const [openInviteLocal, setOpenInviteLocal] = useState<boolean | null>(null)
  const showRevoke = openInviteLocal ?? hasOpenInvite
  const [confirmingRevoke, setConfirmingRevoke] = useState(false)
  const [revokePending, startRevokeTransition] = useTransition()

  const [invitePending, startInviteTransition] = useTransition()
  const [inviteToast, setInviteToast] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const inviteToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (inviteToastTimerRef.current) clearTimeout(inviteToastTimerRef.current)
  }, [])

  const showToast = (message: string) => {
    setInviteToast(message)
    if (inviteToastTimerRef.current) clearTimeout(inviteToastTimerRef.current)
    inviteToastTimerRef.current = setTimeout(() => setInviteToast(null), 2000)
  }

  const handleInvite = () => {
    setInviteError(null)
    startInviteTransition(async () => {
      try {
        const url = unwrapAction(await createInvite())
        // The link exists from here on, whether or not sharing succeeds.
        setOpenInviteLocal(true)
        const result = await shareInviteLink(url, t.soloBanner.shareTitle, t.soloBanner.shareText)
        showToast(result === 'shared' ? t.soloBanner.sharedAndCopied : t.soloBanner.copied)
      } catch (e) {
        setInviteError(describeError(e, t.common.error, t.common.offlineError, t.errors.actions))
      }
    })
  }

  const handleRevoke = () => {
    setInviteError(null)
    startRevokeTransition(async () => {
      try {
        const { revoked, partnerJoined } = unwrapAction(await revokeOpenInvites())
        setConfirmingRevoke(false)
        setOpenInviteLocal(false)
        if (partnerJoined) {
          // An accept got there first: say so instead of "revoked", and pull
          // the duo layout in.
          showToast(t.settings.revokeInvite.partnerJoined)
          router.refresh()
        } else {
          showToast(revoked > 0 ? t.settings.revokeInvite.done : t.settings.revokeInvite.noneOpen)
        }
      } catch (e) {
        // Close the dialog so the error line below the CTA is not hidden
        // behind it.
        setConfirmingRevoke(false)
        setInviteError(describeError(e, t.common.error, t.common.offlineError, t.errors.actions))
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
            className="w-full h-12 rounded-bubble border-0 text-sm font-medium cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--btn-accent-bg)', color: 'var(--btn-accent-text)' }}
          >
            {invitePending ? t.soloBanner.generating : t.settings.inviteCta}
          </button>
          {showRevoke && (
            <button
              type="button"
              onClick={() => setConfirmingRevoke(true)}
              disabled={invitePending || revokePending}
              className="w-full h-12 mt-1 rounded-bubble border-0 bg-transparent text-sm font-medium cursor-pointer disabled:opacity-50 text-ink-2"
            >
              {t.settings.revokeInvite.cta}
            </button>
          )}
          {inviteToast && (
            <div className="text-xs mt-2 px-1 text-center" style={{ color: 'var(--ink-2)' }}>
              {inviteToast}
            </div>
          )}
          {inviteError && (
            <div className="text-xs mt-2 px-1 text-center" style={{ color: 'var(--debit-text)' }}>
              {inviteError}
            </div>
          )}
          <ConfirmModal
            open={confirmingRevoke}
            title={t.settings.revokeInvite.confirmTitle}
            description={t.settings.revokeInvite.confirmBody}
            confirmLabel={t.settings.revokeInvite.confirmLabel}
            pending={revokePending}
            onCancel={() => setConfirmingRevoke(false)}
            onConfirm={handleRevoke}
          />
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
        <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
          {displayName}{youSuffix && <span className="ml-1" style={{ color: 'var(--ink-3)' }}>{t.settings.youSuffix}</span>}
        </div>
        {email && (
          <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--ink-3)' }}>{email}</div>
        )}
      </div>
    </div>
  )
}
