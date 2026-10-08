import { notFound } from 'next/navigation'
import { requireViewerGroupOrRedirect } from '@/lib/auth/viewer'
import { getOutingDetail } from '@/lib/db/queries/outing'
import { buildOutingView } from '@/lib/outing/view'
import { isUuid } from '@/lib/outing/validate'
import { foldPreviewFor, memberPidsOf } from '@/lib/outing/foldback'
import { currentEpochId } from '@/lib/outing/access'
import { db } from '@/lib/db/client'
import { participantClaim } from '../_components/participantClaim'
import { OutingDetailClient } from './_components/OutingDetailClient'

export default async function OutingDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  // A malformed id would fail the uuid cast in Postgres and 500; it is simply not an outing.
  if (!isUuid(id)) notFound()
  const { group } = await requireViewerGroupOrRedirect()
  const detail = await getOutingDetail(id)
  if (!detail || detail.outing.groupId !== group.id) notFound()

  // Same null-guarded resolver the end action uses: a solo group's missing
  // member must not resolve to an unbound friend.
  const { a: memberAParticipantId, b: memberBParticipantId } = memberPidsOf(detail.participants, group.memberA, group.memberB)

  const view = buildOutingView({
    participants: detail.participants.map((p) => ({ id: p.id, displayName: p.displayName, profileId: p.profileId })),
    expenses: detail.expenses.map((e) => ({ paidByParticipantId: e.paidByParticipantId, amount: e.amount, shares: e.shares })),
    settlements: detail.settlements.map((s) => ({ fromParticipantId: s.fromParticipantId, toParticipantId: s.toParticipantId, amount: s.amount })),
    memberAParticipantId,
    memberBParticipantId,
    // The line this outing already folded into the ledger stays out of the list (#1635).
    foldedLine: detail.outing.foldFromParticipantId && detail.outing.foldToParticipantId
      ? { from: detail.outing.foldFromParticipantId, to: detail.outing.foldToParticipantId }
      : null,
  })

  // Same in-request check the end action makes: only an active outing in the
  // current chapter folds, so only then is there anything to preview.
  const foldPreview = foldPreviewFor(detail.outing, await currentEpochId(db, group.id), view.coupleNet)

  return (
    <OutingDetailClient
      outing={{
        id: detail.outing.id,
        name: detail.outing.name,
        currency: detail.outing.currency,
        status: detail.outing.status,
      }}
      // Profile ids stay on the server: a friend's bound account is not the
      // viewer's to see, and nothing on the page needs it.
      view={{ ...view, participants: view.participants.map((p) => ({ id: p.id, displayName: p.displayName, net: p.net })) }}
      foldPreview={foldPreview}
      expenses={detail.expenses}
      participants={detail.participants.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        active: p.deactivatedAt === null,
        ...participantClaim(p),
        isMember: p.profileId !== null && (p.profileId === group.memberA || p.profileId === group.memberB),
      }))}
      settlements={[...detail.settlements].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map((s) => ({
        id: s.id,
        fromParticipantId: s.fromParticipantId,
        toParticipantId: s.toParticipantId,
        amount: s.amount,
      }))}
    />
  )
}
