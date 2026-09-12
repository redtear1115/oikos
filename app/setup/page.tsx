// 建立帳本 / 邀請對方。動線與文案立場見
// docs/superpowers/specs/onboarding-design.md；邀請連結被既有 group 使用者
// 點開時的分流見 invite-existing-group-design.md。
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { oikosGroups } from '@/lib/db/schema'
import { eq, or } from 'drizzle-orm'
import { getTranslations } from '@/lib/i18n/t'
import SetupForm from './SetupForm'

export default async function SetupPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')

  const [group] = await db
    .select()
    .from(oikosGroups)
    .where(or(eq(oikosGroups.memberA, user.id), eq(oikosGroups.memberB, user.id)))
    .limit(1)

  if (group) redirect('/dashboard')

  const t = await getTranslations()
  return <SetupForm t={t} />
}
