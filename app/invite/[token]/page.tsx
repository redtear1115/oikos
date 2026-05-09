import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { acceptInvite } from '@/actions/invite'
import { getTranslations } from '@/lib/i18n/t'
import type { InviteAcceptError } from '@/lib/invite'

interface Props {
  params: Promise<{ token: string }>
}

export default async function InvitePage({ params }: Props) {
  const { token } = await params
  const user = await getCurrentUser()

  if (!user) {
    redirect(`/sign-in?next=/invite/${token}`)
  }

  // redirect() throws internally in Next.js — must NOT be inside try/catch
  let errorCode = ''
  try {
    await acceptInvite(token)
  } catch (err) {
    errorCode = err instanceof Error ? err.message : ''
  }

  if (!errorCode) {
    redirect('/dashboard')
  }

  const t = await getTranslations()
  const errorMap: Record<InviteAcceptError, string> = {
    invalid_or_expired: t.invite.errors.invalidOrExpired,
    already_used: t.invite.errors.alreadyUsed,
    expired: t.invite.errors.expired,
    group_not_found: t.invite.errors.groupNotFound,
    group_full: t.invite.errors.groupFull,
    already_member: t.invite.errors.alreadyMember,
  }
  const errorMessage = errorMap[errorCode as InviteAcceptError] ?? t.invite.errors.unknown

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
