import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { oikosGroups, profiles } from '@/lib/db/schema'
import { eq, or, inArray } from 'drizzle-orm'
import { getInsuranceAssets } from '@/actions/income'
import { RuleForm } from '../_components/RuleForm'

export default async function NewRulePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const [group] = await db.select().from(oikosGroups)
    .where(or(eq(oikosGroups.memberA, user.id), eq(oikosGroups.memberB, user.id)))
    .limit(1)
  if (!group) redirect('/setup')

  const memberIds = [group.memberA, group.memberB].filter(Boolean) as string[]
  const recipients = await db.select({ id: profiles.id, displayName: profiles.displayName })
    .from(profiles).where(inArray(profiles.id, memberIds))

  const insuranceAssets = await getInsuranceAssets()

  return <RuleForm recipients={recipients} insuranceAssets={insuranceAssets} />
}
