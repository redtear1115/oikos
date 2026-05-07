import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { oikosGroups, profiles, recurringIncomeRules } from '@/lib/db/schema'
import { and, eq, isNull, or, inArray } from 'drizzle-orm'
import { getInsuranceAssets } from '@/actions/income'
import { RuleForm, type RuleFormValues } from '../_components/RuleForm'

export default async function EditRulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const [group] = await db.select().from(oikosGroups)
    .where(or(eq(oikosGroups.memberA, user.id), eq(oikosGroups.memberB, user.id)))
    .limit(1)
  if (!group) redirect('/setup')

  const [rule] = await db.select().from(recurringIncomeRules)
    .where(and(
      eq(recurringIncomeRules.id, id),
      eq(recurringIncomeRules.groupId, group.id),
      isNull(recurringIncomeRules.deletedAt),
    )).limit(1)
  if (!rule) notFound()

  const memberIds = [group.memberA, group.memberB].filter(Boolean) as string[]
  const recipients = await db.select({ id: profiles.id, displayName: profiles.displayName })
    .from(profiles).where(inArray(profiles.id, memberIds))

  const insuranceAssets = await getInsuranceAssets()

  const initial: RuleFormValues = {
    id: rule.id,
    amount: rule.amount,
    category: rule.category,
    recipientId: rule.recipientId,
    intervalMonths: rule.intervalMonths as 1 | 3 | 6 | 12,
    dayOfMonth: rule.dayOfMonth,
    startsOn: rule.startsOn,
    endsOn: rule.endsOn,
    source: rule.source,
    assetId: rule.assetId,
  }

  return <RuleForm initial={initial} recipients={recipients} insuranceAssets={insuranceAssets} />
}
