'use client'

import { useState, useTransition } from 'react'
import { signOut } from '@/actions/auth'
import { ConfirmModal } from '@/app/(dashboard)/_components/ConfirmModal'
import { clearDynamicCache } from '@/lib/offline/swControl'

export function LogoutButton() {
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={pending}
        className="w-full h-12 rounded-[14px] border-0 bg-transparent text-sm font-medium cursor-pointer disabled:opacity-50"
        style={{ color: 'var(--destructive)' }}
      >
        {pending ? '登出中…' : '登出'}
      </button>
      <ConfirmModal
        open={confirming}
        title="登出 Futari？"
        description="下次需要重新用 Google 登入。未邀請對方加入的紀錄不會遺失。"
        confirmLabel="登出"
        pending={pending}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false)
          startTransition(async () => {
            // Drop cached HTML so the next user on this device can't see the
            // previous user's pages. Toggle preference / app shell precache
            // are kept (they're not user-scoped).
            await clearDynamicCache().catch(() => {})
            await signOut()
          })
        }}
      />
    </>
  )
}
