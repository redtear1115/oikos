import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMyGroup } from '@/actions/group'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const group = await getMyGroup()
  if (!group) redirect('/setup')

  return <>{children}</>
}
