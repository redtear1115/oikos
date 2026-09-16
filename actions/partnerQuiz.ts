'use server'

import { db } from '@/lib/db/client'
import { partnerQuizAnswers, partnerQuizSessions } from '@/lib/db/schema'
import { requireViewerGroup } from '@/lib/auth/viewer'
import {
  validateAnswersBatch,
  type PartnerQuizAnswerInput,
} from '@/lib/partnerQuiz'
import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { captureServer } from '@/lib/analytics/server'
import { action } from '@/lib/action-errors'

export interface SubmitPartnerQuizAnswersInput {
  sessionId: string
  answers: PartnerQuizAnswerInput[]
}

export interface SubmitPartnerQuizAnswersResult {
  revealed: boolean
}

/**
 * Batch-writes the viewer's 3 answers for the session. Refuses if the viewer
 * already has answers stored (re-submit not allowed) or the input doesn't
 * match the session's `question_keys`. When both members are complete after
 * this insert, stamps `revealed_at` in the same transaction so the reveal
 * surface unlocks atomically.
 */
export const submitPartnerQuizAnswers = action(async (
  input: SubmitPartnerQuizAnswersInput,
): Promise<SubmitPartnerQuizAnswersResult> => {
  const { user, group } = await requireViewerGroup()
  if (!group.memberB) {
    // Error CODE, not prose: QuestionCard renders whatever code this action
    // raises, so a literal string here ships hard-coded zh-TW to en / ja
    // viewers and bypasses `quiz.errors.solo` entirely. The `action()` wrapper
    // turns this throw into `{ ok: false, code: 'solo_group' }` at the export
    // boundary (#1223); `describeQuizError` maps it.
    throw new Error('solo_group')
  }

  const [session] = await db
    .select({
      id: partnerQuizSessions.id,
      groupId: partnerQuizSessions.groupId,
      questionKeys: partnerQuizSessions.questionKeys,
      revealedAt: partnerQuizSessions.revealedAt,
    })
    .from(partnerQuizSessions)
    .where(eq(partnerQuizSessions.id, input.sessionId))
    .limit(1)

  // Codes, not prose — same contract as `solo_group` above (#1140).
  if (!session) throw new Error('session_not_found')
  if (session.groupId !== group.id) throw new Error('wrong_group')
  if (session.revealedAt) {
    throw new Error('already_revealed')
  }

  const { answers } = validateAnswersBatch(session.questionKeys, input.answers)

  const revealed = await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: partnerQuizAnswers.id })
      .from(partnerQuizAnswers)
      .where(and(
        eq(partnerQuizAnswers.sessionId, session.id),
        eq(partnerQuizAnswers.memberId, user.id),
      ))
    if (existing.length > 0) {
      throw new Error('already_answered')
    }

    await tx.insert(partnerQuizAnswers).values(
      answers.map((a) => ({
        sessionId: session.id,
        memberId: user.id,
        questionKey: a.questionKey,
        choiceKey: a.choiceKey,
      })),
    )

    const allAnswers = await tx
      .select({ memberId: partnerQuizAnswers.memberId })
      .from(partnerQuizAnswers)
      .where(eq(partnerQuizAnswers.sessionId, session.id))

    const total = session.questionKeys.length
    const expected = total * 2
    const memberA = group.memberA
    const memberB = group.memberB!
    const countA = allAnswers.filter((r) => r.memberId === memberA).length
    const countB = allAnswers.filter((r) => r.memberId === memberB).length

    if (allAnswers.length === expected && countA === total && countB === total) {
      await tx
        .update(partnerQuizSessions)
        .set({ revealedAt: new Date() })
        .where(eq(partnerQuizSessions.id, session.id))
      return true
    }
    return false
  })

  // Both members' /review/[YYYY-MM] pages derive from this session's state
  // (any month, because the invitation card and CTA link follow viewer-level
  // status). We don't know which month the viewer entered from, so blanket-
  // revalidate the dashboard + bust client cache on next nav.
  revalidatePath('/dashboard')

  // Engagement signal (#818): fires only on the second answerer who triggers reveal.
  if (revealed) {
    await captureServer(user.id, 'partner_quiz_completed', { question_count: session.questionKeys.length })
  }

  return { revealed }
})
