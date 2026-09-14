// 接受邀請時依接受者既有 group 狀態分流（單人告知 / 雙人擋下 / 無則照舊）的
// 完整決策見 docs/superpowers/specs/invite-existing-group-design.md。
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { previewInvite } from '@/actions/invite'
import { getTranslations, getLocale } from '@/lib/i18n/t'
import { ogLocale, alternateOgLocales, ogImage } from '@/lib/i18n/seo'
import { localizedSignInPath } from '@/lib/i18n/server-redirect'
import { InviteConfirm } from './InviteConfirm'

interface Props {
  params: Promise<{ token: string }>
}

// Deliberately generic — no group name, no inviter name, no financial info.
// This preview is crawled and cached by chat-app link previewers (LINE,
// Messenger, WhatsApp) the moment the invite link is pasted anywhere, so it
// must look identical for every invite. `robots: noindex` keeps it out of
// search engines even though a search crawler would ignore that signal less
// reliably than `robots.ts` alone (see app/robots.ts, which already
// disallows /invite/ for well-behaved crawlers).
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  const t = await getTranslations()
  const { title, description, ogDescription } = t.invite.meta
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description: ogDescription,
      siteName: 'Futari · 雙人記帳',
      type: 'website',
      locale: ogLocale(locale),
      alternateLocale: alternateOgLocales(locale),
      images: [{ url: ogImage(locale), width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: ogDescription,
      images: [ogImage(locale)],
    },
  }
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
        hasSoloLedger={preview.hasSoloLedger}
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
    inviter_not_member: t.invite.errors.inviterNotMember,
  }
  const errorMessage =
    preview.error === 'already_in_duo'
      ? t.invite.errors.alreadyInDuo.replace('{partner}', preview.partnerName || t.invite.fallbackInviter)
      : (errorMap[preview.error] ?? t.invite.errors.unknown)

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
        <p className="text-sm mb-6" style={{ color: 'var(--debit-text)' }}>
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
