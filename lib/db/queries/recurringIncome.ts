import { db } from '@/lib/db/client'
import {
  recurringIncomeRules,
  pendingIncomeOccurrences,
} from '@/lib/db/schema'
import { and, asc, eq, isNull } from 'drizzle-orm'

export interface RecurringRuleRow {
  id: string
  recipientId: string
  amount: number
  category: string
  source: string | null
  assetId: string | null
  intervalMonths: number
  dayOfMonth: number
  startsOn: string
  endsOn: string | null
  nextOccurrenceAt: string
  pausedAt: Date | null
}

export async function listActiveRules(groupId: string): Promise<RecurringRuleRow[]> {
  return db
    .select({
      id: recurringIncomeRules.id,
      recipientId: recurringIncomeRules.recipientId,
      amount: recurringIncomeRules.amount,
      category: recurringIncomeRules.category,
      source: recurringIncomeRules.source,
      assetId: recurringIncomeRules.assetId,
      intervalMonths: recurringIncomeRules.intervalMonths,
      dayOfMonth: recurringIncomeRules.dayOfMonth,
      startsOn: recurringIncomeRules.startsOn,
      endsOn: recurringIncomeRules.endsOn,
      nextOccurrenceAt: recurringIncomeRules.nextOccurrenceAt,
      pausedAt: recurringIncomeRules.pausedAt,
    })
    .from(recurringIncomeRules)
    .where(and(
      eq(recurringIncomeRules.groupId, groupId),
      isNull(recurringIncomeRules.deletedAt),
    ))
    .orderBy(asc(recurringIncomeRules.nextOccurrenceAt))
}

export interface PendingRow {
  id: string
  ruleId: string
  proposedAmount: number
  proposedDate: string
  category: string
  source: string | null
  recipientId: string
  assetId: string | null
}

export async function listActivePendings(groupId: string): Promise<PendingRow[]> {
  return db
    .select({
      id: pendingIncomeOccurrences.id,
      ruleId: pendingIncomeOccurrences.ruleId,
      proposedAmount: pendingIncomeOccurrences.proposedAmount,
      proposedDate: pendingIncomeOccurrences.proposedDate,
      category: recurringIncomeRules.category,
      source: recurringIncomeRules.source,
      recipientId: recurringIncomeRules.recipientId,
      assetId: recurringIncomeRules.assetId,
    })
    .from(pendingIncomeOccurrences)
    .innerJoin(recurringIncomeRules, eq(recurringIncomeRules.id, pendingIncomeOccurrences.ruleId))
    .where(and(
      eq(pendingIncomeOccurrences.groupId, groupId),
      isNull(pendingIncomeOccurrences.skippedAt),
      isNull(pendingIncomeOccurrences.resolvedTxId),
    ))
    .orderBy(asc(pendingIncomeOccurrences.proposedDate))
}
