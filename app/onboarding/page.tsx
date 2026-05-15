import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { oikosGroups } from '@/lib/db/schema'
import { eq, or } from 'drizzle-orm'
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

  return <PhilosophyCards />
}
