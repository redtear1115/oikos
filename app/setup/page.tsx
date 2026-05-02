'use client'

import { useState } from 'react'
import { createGroup } from '@/actions/group'
import { createInvite } from '@/actions/invite'
import { useRouter } from 'next/navigation'

export default function SetupPage() {
  const [name, setName] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const group = await createGroup(name.trim())
      const url = await createInvite(group.id)
      setInviteUrl(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : '發生錯誤')
    }
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (inviteUrl) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col gap-4 rounded-2xl bg-white p-8 shadow-sm w-full max-w-sm">
          <h1 className="text-lg font-semibold">帳本已建立 🎉</h1>
          <p className="text-sm text-gray-600">把下方連結傳給你的伴侶，讓他們加入：</p>
          <div className="rounded-lg bg-gray-50 px-4 py-3 text-xs text-gray-700 break-all">
            {inviteUrl}
          </div>
          <button
            onClick={handleCopy}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white"
          >
            {copied ? '已複製！' : '複製連結'}
          </button>
          <button
            onClick={() => router.push('/dashboard')}
            className="text-sm text-gray-500 underline"
          >
            先進去看看
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl bg-white p-8 shadow-sm w-full max-w-sm">
        <h1 className="text-lg font-semibold">建立家庭帳本</h1>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="帳本名稱（例：我們家）"
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm"
          required
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white"
        >
          建立
        </button>
      </form>
    </main>
  )
}
