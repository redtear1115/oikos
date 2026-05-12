import { db } from '@/lib/db/client'
import { partnerQuizAnswers, partnerQuizSessions } from '@/lib/db/schema'
import { and, asc, eq } from 'drizzle-orm'

export interface PartnerQuizSessionRow {
  id: string
  groupId: string
  questionKeys: string[]
  createdAt: Date
  revealedAt: Date | null
}

export interface PartnerQuizAnswerRow {
  id: string
  sessionId: string
  memberId: string
  questionKey: string
  choiceKey: string
  answeredAt: Date
}

export async function loadPartnerQuizSessionByGroup(
  groupId: string,
): Promise<PartnerQuizSessionRow | null> {
  const [row] = await db
    .select({
      id: partnerQuizSessions.id,
      groupId: partnerQuizSessions.groupId,
      questionKeys: partnerQuizSessions.questionKeys,
      createdAt: partnerQuizSessions.createdAt,
      revealedAt: partnerQuizSessions.revealedAt,
    })
    .from(partnerQuizSessions)
    .where(eq(partnerQuizSessions.groupId, groupId))
    .limit(1)
  return row ?? null
}

export async function loadPartnerQuizAnswers(
  sessionId: string,
): Promise<PartnerQuizAnswerRow[]> {
  return db
    .select({
      id: partnerQuizAnswers.id,
      sessionId: partnerQuizAnswers.sessionId,
      memberId: partnerQuizAnswers.memberId,
      questionKey: partnerQuizAnswers.questionKey,
      choiceKey: partnerQuizAnswers.choiceKey,
      answeredAt: partnerQuizAnswers.answeredAt,
    })
    .from(partnerQuizAnswers)
    .where(eq(partnerQuizAnswers.sessionId, sessionId))
    .orderBy(asc(partnerQuizAnswers.answeredAt))
}

export async function loadPartnerQuizAnswerCountForMember(
  sessionId: string,
  memberId: string,
): Promise<number> {
  const rows = await db
    .select({ id: partnerQuizAnswers.id })
    .from(partnerQuizAnswers)
    .where(and(
      eq(partnerQuizAnswers.sessionId, sessionId),
      eq(partnerQuizAnswers.memberId, memberId),
    ))
  return rows.length
}
