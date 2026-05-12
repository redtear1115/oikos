import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { partnerQuizSessions } from '@/lib/db/schema'
import { profiles } from '@/lib/db/schema'
import { eq, inArray } from 'drizzle-orm'
import {
  loadPartnerQuizSessionByGroup,
  loadPartnerQuizAnswers,
} from '@/lib/db/queries/partnerQuiz'
import { resolveViewerEpochContext } from '@/lib/db/queries/epoch'
import { parseYearMonth, currentYearMonthInTaipei, isAfter } from '@/lib/monthlyReview'
import { pickQuizQuestions } from '@/lib/partnerQuiz'
import { QuizClient } from './_components/QuizClient'

interface PageProps {
  params: Promise<{ month: string }>
}

export default async function PartnerQuizPage({ params }: PageProps) {
  const { month: monthParam } = await params
  const reviewedMonth = parseYearMonth(monthParam)
  if (!reviewedMonth) notFound()

  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')

  // Same future-month guard as /review/[month] itself.
  const today = currentYearMonthInTaipei()
  if (isAfter(reviewedMonth, today)) notFound()

  const context = await resolveViewerEpochContext(user.id)
  if (!context) redirect('/onboarding')
  const { group } = context

  // Solo group → soft fallback (spec: solo mode 不渲染整段 quiz).
  if (!group.memberB) {
    return (
      <QuizClient
        reviewedMonth={reviewedMonth}
        mode="solo"
        sessionId=""
        questionKeys={[]}
        selfAnsweredKeys={[]}
        revealedAt={null}
        viewer={{ id: user.id, displayName: '', avatarUrl: null }}
        partner={null}
        memberAId={group.memberA}
        memberBId=""
        answers={[]}
      />
    )
  }

  // Profiles for both members (used by the answer / reveal / waiting screens).
  const memberIds = [group.memberA, group.memberB]
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
  const partnerProfile = profileRows.find((p) => p.id !== user.id)
  if (!partnerProfile) redirect('/dashboard')

  // Load (or lazily create) the session. Entering this page IS the "start"
  // event per spec — we don't gate it behind a button click.
  let session = await loadPartnerQuizSessionByGroup(group.id)
  if (!session) {
    const picked = pickQuizQuestions()
    // Tolerate the race where a partner just clicked the same link by relying
    // on UNIQUE (group_id) — re-read on conflict.
    try {
      const [created] = await db
        .insert(partnerQuizSessions)
        .values({ groupId: group.id, questionKeys: picked })
        .returning({
          id: partnerQuizSessions.id,
          groupId: partnerQuizSessions.groupId,
          questionKeys: partnerQuizSessions.questionKeys,
          createdAt: partnerQuizSessions.createdAt,
          revealedAt: partnerQuizSessions.revealedAt,
        })
      session = created
    } catch {
      session = await loadPartnerQuizSessionByGroup(group.id)
      if (!session) {
        // Truly unexpected — surface as 404 rather than swallow.
        notFound()
      }
    }
  }

  const answers = await loadPartnerQuizAnswers(session.id)
  const selfAnsweredKeys = answers
    .filter((a) => a.memberId === user.id)
    .map((a) => a.questionKey)

  const mode: 'answer' | 'waiting' | 'reveal' = session.revealedAt
    ? 'reveal'
    : selfAnsweredKeys.length >= session.questionKeys.length
      ? 'waiting'
      : 'answer'

  return (
    <QuizClient
      reviewedMonth={reviewedMonth}
      mode={mode}
      sessionId={session.id}
      questionKeys={session.questionKeys}
      selfAnsweredKeys={selfAnsweredKeys}
      revealedAt={session.revealedAt ? session.revealedAt.toISOString() : null}
      viewer={{
        id: viewerProfile.id,
        displayName: viewerProfile.displayName,
        avatarUrl: viewerProfile.avatarUrl,
      }}
      partner={{
        id: partnerProfile.id,
        displayName: partnerProfile.displayName,
        avatarUrl: partnerProfile.avatarUrl,
      }}
      memberAId={group.memberA}
      memberBId={group.memberB}
      answers={answers.map((a) => ({
        memberId: a.memberId,
        questionKey: a.questionKey,
        choiceKey: a.choiceKey,
      }))}
    />
  )
}
