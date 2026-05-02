'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { SheetBackdrop } from '@/app/(dashboard)/dashboard/_components/SheetBackdrop'

interface Props {
  open: boolean
  /** Sheet header label (e.g. "帳本名稱"). */
  title: string
  /** Initial value to seed the input when open transitions to true. */
  initialValue: string
  /** Called when the user submits a new value. Resolve to close the sheet; reject to show error. */
  onSubmit: (value: string) => Promise<void>
  onClose: () => void
  /** Optional placeholder. Defaults to the title. */
  placeholder?: string
  /** Optional max length hint (visual only — server enforces). */
  maxLength?: number
}

export function EditTextSheet({ open, title, initialValue, onSubmit, onClose, placeholder, maxLength = 32 }: Props) {
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setValue(initialValue)
    setError('')
    const t = setTimeout(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      el.select()
    }, 250)
    return () => clearTimeout(t)
  }, [open, initialValue])

  if (!open) return null

  const handleConfirm = () => {
    const trimmed = value.trim()
    if (!trimmed) { setError('不能為空'); return }
    startTransition(async () => {
      try {
        await onSubmit(trimmed)
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : '儲存失敗')
      }
    })
  }

  return (
    <>
      <SheetBackdrop open={open} onClick={pending ? () => {} : onClose} />
      <div
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-[100] rounded-t-[20px] pb-6 px-5 pt-5"
        style={{ background: 'var(--bg)', boxShadow: '0 -8px 32px rgba(0,0,0,0.12)' }}
      >
        <div className="text-sm font-semibold mb-3" style={{ color: 'var(--ink)' }}>{title}</div>
        <input
          ref={inputRef}
          type="text"
          value={value}
          maxLength={maxLength}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !pending) {
              e.preventDefault()
              handleConfirm()
            }
          }}
          placeholder={placeholder ?? title}
          className="w-full h-12 px-3 rounded-xl text-sm bg-transparent outline-none"
          style={{
            border: '1px solid var(--hairline)',
            color: 'var(--ink)',
            background: 'var(--surface)',
          }}
        />
        {error && (
          <div className="text-xs mt-2" style={{ color: 'var(--debit)' }}>{error}</div>
        )}
        <div className="flex gap-2 mt-4">
          <button
            onClick={handleConfirm}
            disabled={pending || !value.trim()}
            className="flex-1 h-[46px] rounded-xl border-0 text-white font-semibold text-sm tracking-[0.3px] cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            {pending ? '儲存中…' : '儲存'}
          </button>
          <button
            onClick={onClose}
            disabled={pending}
            className="h-[46px] px-4 rounded-xl text-sm font-medium cursor-pointer"
            style={{
              background: 'var(--surface)',
              color: 'var(--ink-2)',
              border: '1px solid var(--hairline)',
            }}
          >
            取消
          </button>
        </div>
      </div>
    </>
  )
}
