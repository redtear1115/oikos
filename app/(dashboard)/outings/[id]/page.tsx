import { notFound } from 'next/navigation'
import { requireViewerGroupOrRedirect } from '@/lib/auth/viewer'
import { getOutingDetail } from '@/lib/db/queries/outing'
import { buildOutingView } from '@/lib/outing/view'
import { OutingDetailClient } from './_components/OutingDetailClient'

export default async function OutingDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
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
        shareToken: detail.outing.shareToken,
      }}
      view={view}
      coupleNet={view.coupleNet}
      expenses={detail.expenses}
      participants={detail.participants.map((p) => ({ id: p.id, displayName: p.displayName }))}
    />
  )
}
