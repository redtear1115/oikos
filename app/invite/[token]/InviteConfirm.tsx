'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { acceptInvite } from '@/actions/invite'
import { track } from '@/lib/analytics/track'
import { TrustCommitments } from '@/app/(dashboard)/settings/trust/_components/TrustCommitments'
import type { InviteAcceptError } from '@/lib/invite'
import type { Translations } from '@/lib/i18n/locales/zh-TW'

type TrustStrings = Translations['trust']
type InviteStrings = Translations['invite']

interface Props {
  token: string
  groupName: string
  inviterName: string
  trust: TrustStrings
  invite: InviteStrings
}

/**
 * Bilateral trust confirmation step shown to the invitee (member B) before
 * acceptInvite() commits group membership.
 */
export function InviteConfirm({ token, groupName, inviterName, trust, invite }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Invite-funnel step (#734): the invitee reached the accept screen. Fires
  // once per mount (the page server-redirects anonymous invitees to sign-in
  // first, so reaching here means they are authenticated).
  useEffect(() => {
    track('invite_link_opened')
  }, [])

  const heading = trust.bilateral.invitee.heading.replace(
    '{name}',
    inviterName || invite.fallbackInviter
  )

  const handleConfirm = () => {
    setError(null)
    startTransition(async () => {
      try {
        await acceptInvite(token)
        router.push('/dashboard')
      } catch (err) {
        const code = err instanceof Error ? err.message : ''
        const errorMap: Record<InviteAcceptError, string> = {
          invalid_or_expired: invite.errors.invalidOrExpired,
          already_used: invite.errors.alreadyUsed,
          revoked: invite.errors.revoked,
          expired: invite.errors.expired,
          group_not_found: invite.errors.groupNotFound,
          group_full: invite.errors.groupFull,
          already_member: invite.errors.alreadyMember,
        }
        setError(errorMap[code as InviteAcceptError] ?? invite.errors.unknown)
      }
    })
  }

  return (
    <main
      className="flex min-h-screen flex-col px-6 py-10"
      style={{ background: 'var(--bg)' }}
    >
      <div className="max-w-sm w-full mx-auto flex flex-col gap-6">
        <div>
          <p className="text-sm" style={{ color: 'var(--ink-3)' }}>
            {invite.joiningGroupLabel.replace('{group}', groupName)}
          </p>
          <h1
            className="text-page leading-tight mt-2"
            style={{ fontFamily: 'var(--font-fraunces)', color: 'var(--ink)', fontWeight: 500 }}
          >
            {heading}
          </h1>
          <p className="text-sm mt-3 leading-relaxed" style={{ color: 'var(--ink-2)' }}>
            {trust.bilateral.invitee.subtitle}
          </p>
        </div>

        <TrustCommitments t={trust} />

        {error && (
          <div
            role="alert"
            className="rounded-lg p-3 text-sm flex items-start gap-2"
            style={{
              background: 'var(--debit-soft)',
              borderLeft: '2px solid var(--debit)',
              color: 'var(--debit)',
            }}
          >
            <span aria-hidden="true">⚠</span>
            <span className="flex-1">{error}</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleConfirm}
          disabled={pending}
          className="h-12 rounded-xl border-0 text-sm font-semibold cursor-pointer disabled:opacity-50"
          style={{ background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
        >
          {pending ? trust.bilateral.invitee.confirming : trust.bilateral.invitee.cta}
        </button>
      </div>
    </main>
  )
}
