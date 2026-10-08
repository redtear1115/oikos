import { notFound, redirect } from 'next/navigation'
import { isLocale } from '@/lib/i18n/locales-meta'
import { dictionaries } from '@/lib/i18n/t'
import { resolveReader } from '@/lib/outing/access'
import { getOutingFullView } from '@/lib/db/queries/outingPublic'
import { OutingMessage } from '../../_components/OutingPublicChrome'
import { OutingParticipantView } from '../../_components/OutingParticipantView'
import { LinkOpened } from '../../_components/LinkOpened'

// /<locale>/outing/r/<outingId> (#1558): where a friend lands after joining,
// and where 「我參與的出遊」 and the sign-in `next` point. The uuid alone grants
// nothing: the request must carry this outing's claim cookie or a session
// bound to one of its slots (lib/outing/access.ts › resolveReader). Anyone
// else gets the no-access message and no outing content, not even the name.
//
// Binding is never done here on render: a signed-in visitor holding an unbound
// claim cookie sees 「這是你嗎？」 and binds with an explicit action.

export default async function OutingResumePage({
  params,
}: {
  params: Promise<{ locale: string; outingId: string }>
}) {
  const { locale, outingId } = await params
  if (!isLocale(locale)) notFound()
  const c = dictionaries[locale].outingPublic

  const reader = await resolveReader(outingId)
  if (!reader) {
    return (
      <>
        <LinkOpened state="no_access" />
        <OutingMessage title={c.noAccessTitle} body={c.noAccessBody} />
      </>
    )
  }
  // Members manage the outing from their own ledger.
  if (reader.actor.kind === 'member') redirect(`/outings/${reader.outing.id}`)

  const { actor } = reader
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- isAdmin is always false here; keep it off the client.
  const { isAdmin, ...view } = await getOutingFullView(reader.outing, actor)
  const resume = `/${locale}/outing/r/${reader.outing.id}`
  // Unencoded like /invite's: `resume` is a validated locale + uuid, nothing to
  // escape. The share token never goes into `next` (it would land in Supabase
  // auth logs and the OAuth round trip).
  const signInHref = `/${locale}/sign-in?next=${resume}&from=outing`

  return (
    <OutingParticipantView
      view={view}
      needsBind={actor.via === 'cookie' && actor.userId !== null}
      signedIn={actor.userId !== null}
      signInHref={signInHref}
    />
  )
}
