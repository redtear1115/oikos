import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'

export default async function RootPage() {
  const user = await getCurrentUser()
  redirect(user ? '/dashboard' : '/sign-in')
}
