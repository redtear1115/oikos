import { db } from '@/lib/db/client'
import {
  recurringExpenseRules,
  pendingExpenseOccurrences,
} from '@/lib/db/schema'
import type { SplitType } from '@/lib/balance'
import { and, asc, eq, isNull } from 'drizzle-orm'

export interface RecurringExpenseRuleRow {
  id: string
  paidBy: string
  amount: number
  splitType: SplitType
  splitRatioA: number | null
  description: string
  category: string
  assetId: string | null
  intervalMonths: number
  dayOfMonth: number
  startsOn: string
  endsOn: string | null
  nextOccurrenceAt: string
  pausedAt: Date | null
}

export async function listActiveRules(groupId: string): Promise<RecurringExpenseRuleRow[]> {
  return db
    .select({
      id: recurringExpenseRules.id,
      paidBy: recurringExpenseRules.paidBy,
      amount: recurringExpenseRules.amount,
      splitType: recurringExpenseRules.splitType,
      splitRatioA: recurringExpenseRules.splitRatioA,
      description: recurringExpenseRules.description,
      category: recurringExpenseRules.category,
      assetId: recurringExpenseRules.assetId,
      intervalMonths: recurringExpenseRules.intervalMonths,
      dayOfMonth: recurringExpenseRules.dayOfMonth,
      startsOn: recurringExpenseRules.startsOn,
      endsOn: recurringExpenseRules.endsOn,
      nextOccurrenceAt: recurringExpenseRules.nextOccurrenceAt,
      pausedAt: recurringExpenseRules.pausedAt,
    })
    .from(recurringExpenseRules)
    .where(and(
      eq(recurringExpenseRules.groupId, groupId),
      isNull(recurringExpenseRules.deletedAt),
    ))
    .orderBy(asc(recurringExpenseRules.nextOccurrenceAt))
}

export interface PendingExpenseRow {
  id: string
  ruleId: string
  proposedAmount: number
  proposedDate: string
  proposedDescription: string
  proposedPaidBy: string
  proposedSplitType: SplitType
  category: string
  assetId: string | null
}

export async function listActivePendings(groupId: string): Promise<PendingExpenseRow[]> {
  return db
    .select({
      id: pendingExpenseOccurrences.id,
      ruleId: pendingExpenseOccurrences.ruleId,
      proposedAmount: pendingExpenseOccurrences.proposedAmount,
      proposedDate: pendingExpenseOccurrences.proposedDate,
      proposedDescription: pendingExpenseOccurrences.proposedDescription,
      proposedPaidBy: pendingExpenseOccurrences.proposedPaidBy,
      proposedSplitType: pendingExpenseOccurrences.proposedSplitType,
      category: recurringExpenseRules.category,
      assetId: recurringExpenseRules.assetId,
    })
    .from(pendingExpenseOccurrences)
    .innerJoin(recurringExpenseRules, eq(recurringExpenseRules.id, pendingExpenseOccurrences.ruleId))
    .where(and(
      eq(pendingExpenseOccurrences.groupId, groupId),
      isNull(pendingExpenseOccurrences.skippedAt),
      isNull(pendingExpenseOccurrences.resolvedTxId),
    ))
    .orderBy(asc(pendingExpenseOccurrences.proposedDate))
}
