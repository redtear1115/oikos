'use client'

import { useState } from 'react'
import { createGroup } from '@/actions/group'
import { useRouter } from 'next/navigation'

export default function SetupPage() {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createGroup(name.trim())
      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : '發生錯誤')
    }
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
