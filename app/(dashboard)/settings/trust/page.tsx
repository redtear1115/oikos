import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { BottomNavSkeleton } from '@/app/(dashboard)/_components/BottomNavSkeleton'
import { TrustContent } from './_components/TrustContent'

export default async function TrustPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')

  return (
    <div className="relative min-h-dvh pb-[92px]">
      <TrustContent />
      <BottomNavSkeleton />
    </div>
  )
}
