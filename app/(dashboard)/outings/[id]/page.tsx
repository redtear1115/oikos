import { notFound } from 'next/navigation'
import { requireViewerGroupOrRedirect } from '@/lib/auth/viewer'
import { getOutingDetail } from '@/lib/db/queries/outing'
import { buildOutingView } from '@/lib/outing/view'
import { isUuid } from '@/lib/outing/validate'
import { participantClaim } from '../_components/participantClaim'
import { OutingDetailClient } from './_components/OutingDetailClient'

export default async function OutingDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  // A malformed id would fail the uuid cast in Postgres and 500; it is simply not an outing.
  if (!isUuid(id)) notFound()
  const { group } = await requireViewerGroupOrRedirect()
  const detail = await getOutingDetail(id)
  if (!detail || detail.outing.groupId !== group.id) notFound()

  const pidForProfile = (profileId: string | null) =>
    detail.participants.find((p) => p.profileId === profileId)?.id ?? null

  const view = buildOutingView({
    participants: detail.participants.map((p) => ({ id: p.id, displayName: p.displayName, profileId: p.profileId })),
    expenses: detail.expenses.map((e) => ({ paidByParticipantId: e.paidByParticipantId, amount: e.amount, shares: e.shares })),
    settlements: detail.settlements.map((s) => ({ fromParticipantId: s.fromParticipantId, toParticipantId: s.toParticipantId, amount: s.amount })),
    memberAParticipantId: pidForProfile(group.memberA),
    memberBParticipantId: pidForProfile(group.memberB),
  })

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
      coupleNet={view.coupleNet}
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
