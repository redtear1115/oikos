'use client'

import { useTransition } from 'react'
import { signOut } from '@/actions/auth'

export function LogoutButton() {
  const [pending, startTransition] = useTransition()
  return (
    <button
      onClick={() => startTransition(() => signOut())}
      disabled={pending}
      className="w-full h-12 rounded-[14px] border-0 bg-transparent text-sm font-medium cursor-pointer"
      style={{ color: '#B85A48' }}
    >
      {pending ? '登出中…' : '登出'}
    </button>
  )
}
