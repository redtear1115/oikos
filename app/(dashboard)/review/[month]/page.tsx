import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { profiles } from '@/lib/db/schema'
import { inArray } from 'drizzle-orm'
import {
  loadMonthlyReviewSnapshot,
  loadMonthlyReviewMessages,
} from '@/lib/db/queries/monthlyReview'
import {
  loadPartnerQuizSessionByGroup,
  loadPartnerQuizAnswers,
} from '@/lib/db/queries/partnerQuiz'
import {
  derivePartnerQuizStatus,
  isPartnerQuizQuestionKey,
} from '@/lib/partnerQuiz'
import { resolveViewerEpochContext } from '@/lib/db/queries/epoch'
import {
  parseYearMonth,
  currentYearMonthInTaipei,
  isAfter,
  nextMonth,
} from '@/lib/monthlyReview'
import { ReviewClient } from './_components/ReviewClient'

interface PageProps {
  params: Promise<{ month: string }>
}

export default async function MonthlyReviewPage({ params }: PageProps) {
  const { month: monthParam } = await params
  const reviewedMonth = parseYearMonth(monthParam)
  if (!reviewedMonth) notFound()

  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')

  // Future month → 404 (spec: 「直接訪問 /review/未來月：404」).
  const today = currentYearMonthInTaipei()
  if (isAfter(reviewedMonth, today)) notFound()

  // Pin-aware so /review/[month] reflects the pinned chapter's group when the
  // viewer is browsing a past epoch (possibly cross-group, see #141). The
  // month review is intrinsically tied to a group's chapter, not the viewer's
  // current active group.
  const context = await resolveViewerEpochContext(user.id)
  if (!context) redirect('/onboarding')
  const { group } = context

  const memberIds = [group.memberA, group.memberB].filter((x): x is string => !!x)
  const profileRows = await db
    .select({
      id: profiles.id,
      displayName: profiles.displayName,
      avatarUrl: profiles.avatarUrl,
    })
    .from(profiles)
    .where(inArray(profiles.id, memberIds))

  const viewerProfile = profileRows.find((p) => p.id === user.id)
  if (!viewerProfile) redirect('/sign-in')
  const partnerProfile = group.memberB
    ? profileRows.find((p) => p.id !== user.id)
    : null
  const isSolo = !group.memberB

  const editorMonth = nextMonth(reviewedMonth)

  const [snapshot, pastMessages, editorMessages, quizSession] = await Promise.all([
    loadMonthlyReviewSnapshot(group.id, reviewedMonth.year, reviewedMonth.month),
    loadMonthlyReviewMessages(group.id, reviewedMonth.year, reviewedMonth.month),
    loadMonthlyReviewMessages(group.id, editorMonth.year, editorMonth.month),
    isSolo ? Promise.resolve(null) : loadPartnerQuizSessionByGroup(group.id),
  ])

  // Quiz state — only resolved for dyad groups. Spec: solo mode 不渲染整段
  // quiz；surface 條件「第一次有 MonthlyReviewSnapshot row 後」由 snapshot 存在判定。
  const quizAnswers = quizSession ? await loadPartnerQuizAnswers(quizSession.id) : []
  const selfAnswered = quizSession
    ? quizAnswers.some((a) => a.memberId === user.id)
    : false
  const partnerAnswered = quizSession && partnerProfile
    ? quizAnswers.some((a) => a.memberId === partnerProfile.id)
    : false
  const quizStatus = !isSolo && snapshot
    ? derivePartnerQuizStatus({
        hasSession: !!quizSession,
        selfAnswered,
        partnerAnswered,
        revealedAt: quizSession?.revealedAt ?? null,
      })
    : null
  const quizRevealPreview = quizSession && quizStatus === 'revealed'
    ? quizSession.questionKeys
        .filter((k): k is string => typeof k === 'string' && isPartnerQuizQuestionKey(k))
    : []

  // Snapshot may be missing for the current (still-in-progress) month or for
  // any month that pre-dates the group. Spec: render a friendly "not ready"
  // surface rather than 404, so the editor for next month still works.
  const ownEditorMessage = editorMessages.find((m) => m.memberId === user.id) ?? null
  const partnerEditorMessage = partnerProfile
    ? editorMessages.find((m) => m.memberId !== user.id) ?? null
    : null

  return (
    <ReviewClient
      reviewedMonth={reviewedMonth}
      editorMonth={editorMonth}
      snapshot={snapshot}
      pastMessages={pastMessages.map((m) => ({
        id: m.id,
        memberId: m.memberId,
        body: m.body,
      }))}
      ownEditorMessage={ownEditorMessage ? {
        id: ownEditorMessage.id,
        body: ownEditorMessage.body,
        lockedAt: ownEditorMessage.lockedAt?.toISOString() ?? null,
      } : null}
      partnerEditorMessage={partnerEditorMessage ? {
        id: partnerEditorMessage.id,
        body: partnerEditorMessage.body,
      } : null}
      viewer={{
        id: viewerProfile.id,
        displayName: viewerProfile.displayName,
        avatarUrl: viewerProfile.avatarUrl,
      }}
      partner={partnerProfile ? {
        id: partnerProfile.id,
        displayName: partnerProfile.displayName,
        avatarUrl: partnerProfile.avatarUrl,
      } : null}
      isSolo={isSolo}
      quiz={quizStatus ? {
        status: quizStatus,
        partnerName: partnerProfile?.displayName ?? '',
        revealPreview: quizRevealPreview,
      } : null}
    />
  )
}
