'use server'

import { db } from '@/lib/db/client'
import { partnerQuizAnswers, partnerQuizSessions } from '@/lib/db/schema'
import { requireViewerGroup } from '@/lib/auth/viewer'
import {
  pickQuizQuestions,
  validateAnswersBatch,
  type PartnerQuizAnswerInput,
} from '@/lib/partnerQuiz'
import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

export interface StartPartnerQuizSessionResult {
  sessionId: string
  questionKeys: string[]
  createdNew: boolean
}

/**
 * Idempotent: returns the existing session for the viewer's group if any,
 * otherwise creates a fresh one with 3 random keys from the pool. Refuses to
 * start a session for a solo group — quiz is a two-person ritual.
 */
export async function startPartnerQuizSession(): Promise<StartPartnerQuizSessionResult> {
  const { group } = await requireViewerGroup()
  if (!group.memberB) {
    throw new Error('一個人的時候還沒辦法開始這題問答')
  }

  const [existing] = await db
    .select({
      id: partnerQuizSessions.id,
      questionKeys: partnerQuizSessions.questionKeys,
    })
    .from(partnerQuizSessions)
    .where(eq(partnerQuizSessions.groupId, group.id))
    .limit(1)

  if (existing) {
    return {
      sessionId: existing.id,
      questionKeys: existing.questionKeys,
      createdNew: false,
    }
  }

  const picked = pickQuizQuestions()
  const [created] = await db
    .insert(partnerQuizSessions)
    .values({
      groupId: group.id,
      questionKeys: picked,
    })
    .returning({ id: partnerQuizSessions.id, questionKeys: partnerQuizSessions.questionKeys })

  return {
    sessionId: created.id,
    questionKeys: created.questionKeys,
    createdNew: true,
  }
}

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
export async function submitPartnerQuizAnswers(
  input: SubmitPartnerQuizAnswersInput,
): Promise<SubmitPartnerQuizAnswersResult> {
  const { user, group } = await requireViewerGroup()
  if (!group.memberB) {
    throw new Error('一個人的時候還沒辦法答題')
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

  if (!session) throw new Error('找不到這次的問答')
  if (session.groupId !== group.id) throw new Error('這次的問答不屬於這個家計簿')
  if (session.revealedAt) {
    throw new Error('這次問答已揭曉，無法再修改')
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
      throw new Error('你已經答完了')
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
  return { revealed }
}
