'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createGroup } from '@/actions/group'
import { createInvite } from '@/actions/invite'
import { shareInviteLink } from '@/lib/share'

const NAME_SUGGESTIONS = ['我們倆', '○○家', '日日', 'Home', '一起']
const NAME_MAX = 20

type Step = 'name' | 'invite'

interface CreatedGroup {
  id: string
  name: string
}

export default function SetupForm() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('name')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const [group, setGroup] = useState<CreatedGroup | null>(null)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) { setError('請輸入名稱'); return }
    setError('')
    startTransition(async () => {
      try {
        const g = await createGroup(trimmed)
        const url = await createInvite(g.id)
        setGroup({ id: g.id, name: g.name })
        setInviteUrl(url)
        setStep('invite')
      } catch (err) {
        setError(err instanceof Error ? err.message : '發生錯誤')
      }
    })
  }

  const flashToast = (msg: string) => {
    setToast(msg)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), 2000)
  }

  const handleCopy = async () => {
    if (!inviteUrl) return
    await navigator.clipboard.writeText(inviteUrl)
    flashToast('已複製連結')
  }

  const handleShare = async () => {
    if (!inviteUrl) return
    try {
      const result = await shareInviteLink(inviteUrl)
      if (result === 'copied') flashToast('已複製連結')
    } catch {
      flashToast('分享失敗')
    }
  }

  const handleSkip = () => router.push('/dashboard')

  if (step === 'invite' && group && inviteUrl) {
    return (
      <main
        className="flex min-h-screen flex-col px-6 py-10"
        style={{ background: 'var(--bg)' }}
      >
        <div className="max-w-sm w-full mx-auto flex flex-col gap-6">
          <div>
            <h1
              className="text-[26px] leading-tight"
              style={{ fontFamily: 'var(--font-fraunces)', color: 'var(--ink)', fontWeight: 500 }}
            >
              把連結傳給對方
            </h1>
            <p className="text-sm mt-2" style={{ color: 'var(--ink-2)' }}>
              對方點開後就能加入「{group.name}」。
            </p>
          </div>

          <div
            className="rounded-2xl p-4 flex flex-col gap-3"
            style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium"
                style={{ background: 'var(--accent-soft)', color: 'var(--ink)' }}
              >
                我
              </div>
              <span className="text-sm" style={{ color: 'var(--ink)' }}>已加入</span>
            </div>
            <div className="flex items-center gap-3" style={{ opacity: 0.7 }}>
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm"
                style={{ background: 'var(--surface-alt)', color: 'var(--ink-3)', border: '1px dashed var(--ink-3)' }}
              >
                ?
              </div>
              <span className="text-sm" style={{ color: 'var(--ink-2)' }}>還在等對方加入</span>
            </div>
          </div>

          <div
            className="rounded-2xl px-4 py-3 flex items-center gap-3"
            style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
          >
            <div className="flex-1 min-w-0 text-xs break-all" style={{ color: 'var(--ink-2)' }}>
              {inviteUrl}
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="h-9 px-3 rounded-lg border-0 text-sm font-medium cursor-pointer shrink-0"
              style={{ background: 'var(--ink)', color: '#fff' }}
            >
              複製
            </button>
          </div>

          <button
            type="button"
            onClick={handleShare}
            className="h-12 rounded-xl border-0 text-sm font-semibold cursor-pointer"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            分享連結
          </button>

          <button
            type="button"
            onClick={handleSkip}
            className="text-sm bg-transparent border-0 cursor-pointer mt-2"
            style={{ color: 'var(--ink-2)' }}
          >
            稍後再邀請 →
          </button>

          {toast && (
            <div className="text-xs text-center" style={{ color: 'var(--ink-2)' }}>
              {toast}
            </div>
          )}
        </div>
      </main>
    )
  }

  return (
    <main
      className="flex min-h-screen flex-col px-6 py-10"
      style={{ background: 'var(--bg)' }}
    >
      <form onSubmit={handleCreate} className="max-w-sm w-full mx-auto flex flex-col gap-6">
        <div>
          <h1
            className="text-[26px] leading-tight"
            style={{ fontFamily: 'var(--font-fraunces)', color: 'var(--ink)', fontWeight: 500 }}
          >
            幫你們的家計簿取個名字
          </h1>
          <p className="text-sm mt-2" style={{ color: 'var(--ink-2)' }}>
            之後可以隨時改。簡短一點比較好記。
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <div
            className="rounded-2xl px-4 py-3 flex items-center gap-3"
            style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
          >
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
              maxLength={NAME_MAX}
              placeholder=""
              className="flex-1 bg-transparent border-0 outline-none text-base"
              style={{ color: 'var(--ink)' }}
              autoFocus
            />
            <span className="text-xs tnum shrink-0" style={{ color: 'var(--ink-3)' }}>
              {name.length}/{NAME_MAX}
            </span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {NAME_SUGGESTIONS.map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => setName(s)}
                className="h-8 px-3 rounded-full text-xs cursor-pointer"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--hairline)',
                  color: 'var(--ink-2)',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-sm" style={{ color: 'var(--debit)' }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={!name.trim() || pending}
          className="h-12 rounded-xl border-0 text-white text-sm font-semibold cursor-pointer disabled:opacity-50"
          style={{ background: 'var(--ink)' }}
        >
          {pending ? '建立中…' : '下一步'}
        </button>
      </form>
    </main>
  )
}
