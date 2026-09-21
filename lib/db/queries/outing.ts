import { db } from '@/lib/db/client'
import {
  outings, outingParticipants, outingExpenses, outingExpenseShares, outingSettlements,
} from '@/lib/db/schema'
import { and, eq, isNull, inArray, sql } from 'drizzle-orm'

export interface OutingListRow {
  id: string
  name: string
  status: 'active' | 'settling' | 'ended' | 'archived'
  currency: 'twd' | 'cny' | 'usd' | 'jpy'
  createdAt: Date
  participantCount: number
}

export async function listOutings(groupId: string, epochId: string): Promise<OutingListRow[]> {
  return await db
    .select({
      id: outings.id,
      name: outings.name,
      status: outings.status,
      currency: outings.currency,
      createdAt: outings.createdAt,
      participantCount: sql<number>`(select count(*)::int from "OutingParticipants" p where p.outing_id = ${outings.id})`,
    })
    .from(outings)
    .where(and(
      eq(outings.groupId, groupId),
      eq(outings.epochId, epochId),
      isNull(outings.deletedAt),
    ))
    .orderBy(sql`${outings.createdAt} DESC`)
}

export interface OutingExpenseWithShares {
  id: string
  paidByParticipantId: string
  amount: number
  description: string | null
  category: string | null
  shares: { participantId: string; shareAmount: number }[]
}

export interface OutingDetailRow {
  outing: typeof outings.$inferSelect
  participants: (typeof outingParticipants.$inferSelect)[]
  expenses: OutingExpenseWithShares[]
  settlements: (typeof outingSettlements.$inferSelect)[]
}

export async function getOutingDetail(outingId: string): Promise<OutingDetailRow | null> {
  const [outing] = await db
    .select()
    .from(outings)
    .where(and(eq(outings.id, outingId), isNull(outings.deletedAt)))
    .limit(1)
  if (!outing) return null

  const participants = await db
    .select()
    .from(outingParticipants)
    .where(eq(outingParticipants.outingId, outingId))
    .orderBy(outingParticipants.createdAt)

  const expenseRows = await db
    .select()
    .from(outingExpenses)
    .where(and(eq(outingExpenses.outingId, outingId), isNull(outingExpenses.deletedAt)))
    .orderBy(sql`${outingExpenses.transactedAt} DESC`)

  const expenseIds = expenseRows.map((e) => e.id)
  const shareRows = expenseIds.length
    ? await db.select().from(outingExpenseShares).where(inArray(outingExpenseShares.expenseId, expenseIds))
    : []

  const sharesByExpense = new Map<string, { participantId: string; shareAmount: number }[]>()
  for (const s of shareRows) {
    const arr = sharesByExpense.get(s.expenseId) ?? []
    arr.push({ participantId: s.participantId, shareAmount: s.shareAmount })
    sharesByExpense.set(s.expenseId, arr)
  }

  const expenses: OutingExpenseWithShares[] = expenseRows.map((e) => ({
    id: e.id,
    paidByParticipantId: e.paidByParticipantId,
    amount: e.amount,
    description: e.description,
    category: e.category,
    shares: sharesByExpense.get(e.id) ?? [],
  }))

  const settlements = await db
    .select()
    .from(outingSettlements)
    .where(and(eq(outingSettlements.outingId, outingId), isNull(outingSettlements.deletedAt)))

  return { outing, participants, expenses, settlements }
}
