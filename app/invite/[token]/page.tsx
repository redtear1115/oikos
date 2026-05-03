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
    <main
      className="flex min-h-screen items-center justify-center px-6"
      style={{ background: 'var(--bg)' }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-8 text-center"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
      >
        <h1
          className="text-[22px] leading-tight mb-3"
          style={{ fontFamily: 'var(--font-fraunces)', color: 'var(--ink)', fontWeight: 500 }}
        >
          無法加入帳本
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--debit)' }}>
          {error}
        </p>
        <a
          href="/dashboard"
          className="inline-block text-sm underline"
          style={{ color: 'var(--ink-2)' }}
        >
          回到首頁
        </a>
      </div>
    </main>
  )
}
