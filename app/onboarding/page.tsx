// 這頁是 sign-in 之後、建立帳本之前的哲學卡片。整條 onboarding 動線
// （sign-in → 建群組 → 邀請對方／稍後再說）見
// docs/superpowers/specs/onboarding-design.md。
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { oikosGroups } from '@/lib/db/schema'
import { eq, or } from 'drizzle-orm'
import { getTranslations } from '@/lib/i18n/t'
import PhilosophyCards from './PhilosophyCards'

// Auth-walled, transient flow — keep crawlers out (#391). robots.ts also
// disallows /onboarding so the signal is consistent even if redirects misfire.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function OnboardingPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')

  const [group] = await db
    .select()
    .from(oikosGroups)
    .where(or(eq(oikosGroups.memberA, user.id), eq(oikosGroups.memberB, user.id)))
    .limit(1)

  if (group) redirect('/dashboard')

  // Outside the (dashboard) layout, so there is no TranslationsProvider here —
  // hand the cards their copy directly, the same way /setup does (#1163).
  const t = await getTranslations()
  return <PhilosophyCards copy={t.onboarding} />
}
