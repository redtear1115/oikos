import { notFound, redirect } from 'next/navigation'
import { isLocale } from '@/lib/i18n/locales-meta'
import { dictionaries } from '@/lib/i18n/t'
import { getOutingLanding } from '@/lib/db/queries/outingPublic'
import { resolveReader } from '@/lib/outing/access'
import { OutingHeader, OutingMessage } from '../_components/OutingPublicChrome'
import { SlotPicker } from '../_components/SlotPicker'
import { LinkOpened } from '../_components/LinkOpened'

// /<locale>/outing/<shareToken> (#1558). What the share token alone shows:
// the outing name, whether it is active, and the name list with claim state
// (lib/db/queries/outingPublic.ts › getOutingLanding). No amounts, no feed.
//
// Someone this request already identifies (claim cookie, bound session, or a
// member of the outing's ledger) is sent on to their full view, so a friend
// reopening the chat link lands back in the outing, not on the picker.
// The token is passed to the picker only because joinOuting needs it, and the
// URL already carries it; it never goes into `next` or analytics.

export default async function OutingSharePage({
  params,
}: {
  params: Promise<{ locale: string; shareToken: string }>
}) {
  const { locale, shareToken } = await params
  if (!isLocale(locale)) notFound()
  const c = dictionaries[locale].outingPublic

  const landing = await getOutingLanding(shareToken)
  if (!landing) {
    return (
      <>
        <LinkOpened state="invalid" />
        <OutingMessage title={c.invalidTitle} body={c.invalidBody} />
      </>
    )
  }

  const reader = await resolveReader(landing.outingId)
  if (reader) {
    redirect(reader.actor.kind === 'member'
      ? `/outings/${landing.outingId}`
      : `/${locale}/outing/r/${landing.outingId}`)
  }

  return (
    <>
      <OutingHeader title={landing.name} />
      <SlotPicker
        shareToken={shareToken}
        outingId={landing.outingId}
        locale={locale}
        active={landing.status === 'active'}
        slots={landing.slots}
      />
    </>
  )
}
