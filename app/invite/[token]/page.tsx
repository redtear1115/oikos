import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { previewInvite } from '@/actions/invite'
import { getTranslations } from '@/lib/i18n/t'
import { localizedSignInPath } from '@/lib/i18n/server-redirect'
import { InviteConfirm } from './InviteConfirm'

interface Props {
  params: Promise<{ token: string }>
}

export default async function InvitePage({ params }: Props) {
  const { token } = await params
  const user = await getCurrentUser()

  if (!user) {
    // `from=invite` attributes an invitee's eventual sign-up to the invite
    // funnel (entry_source=invite); `next` returns them to accept the invite.
    redirect(await localizedSignInPath(`?next=/invite/${token}&from=invite`))
  }

  const preview = await previewInvite(token)
  const t = await getTranslations()

  if (preview.ok) {
    return (
      <InviteConfirm
        token={token}
        groupName={preview.groupName}
        inviterName={preview.inviterName}
        trust={t.trust}
        invite={t.invite}
      />
    )
  }

  const errorMap: Record<typeof preview.error, string> = {
    invalid_or_expired: t.invite.errors.invalidOrExpired,
    already_used: t.invite.errors.alreadyUsed,
    revoked: t.invite.errors.revoked,
    expired: t.invite.errors.expired,
    group_not_found: t.invite.errors.groupNotFound,
    group_full: t.invite.errors.groupFull,
    already_member: t.invite.errors.alreadyMember,
    already_in_duo: t.invite.errors.alreadyInDuo,
  }
  const errorMessage = errorMap[preview.error] ?? t.invite.errors.unknown

  return (
    <main
      className="flex min-h-screen items-center justify-center px-6"
      style={{ background: 'var(--bg)' }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-8 text-center"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
      >
        <h1
          className="text-title leading-tight mb-3"
          style={{ fontFamily: 'var(--font-fraunces)', color: 'var(--ink)', fontWeight: 500 }}
        >
          {t.invite.errorTitle}
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--debit)' }}>
          {errorMessage}
        </p>
        <a
          href="/dashboard"
          className="inline-block text-sm underline"
          style={{ color: 'var(--ink-2)' }}
        >
          {t.invite.backToHome}
        </a>
      </div>
    </main>
  )
}
