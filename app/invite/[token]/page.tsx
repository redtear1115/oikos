import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { acceptInvite } from '@/actions/invite'

interface Props {
  params: Promise<{ token: string }>
}

export default async function InvitePage({ params }: Props) {
  const { token } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/sign-in?next=/invite/${token}`)
  }

  // redirect() throws internally in Next.js — must NOT be inside try/catch
  let error = ''
  try {
    await acceptInvite(token)
  } catch (err) {
    error = err instanceof Error ? err.message : '無法加入帳本'
  }

  if (!error) {
    redirect('/dashboard')
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="rounded-2xl bg-white p-8 shadow-sm text-center">
        <p className="text-sm text-red-500">{error}</p>
        <a href="/dashboard" className="mt-4 block text-sm text-gray-500 underline">
          回到首頁
        </a>
      </div>
    </main>
  )
}
