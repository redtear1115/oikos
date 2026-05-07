'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { SheetBackdrop } from '@/app/(dashboard)/dashboard/_components/SheetBackdrop'
import { useFocusAndSelectOnOpen } from '@/app/(dashboard)/_components/useFocusAndSelectOnOpen'
import {
  createInvoiceCredential,
  renameInvoiceCredential,
  refreshInvoiceCredential,
  deleteInvoiceCredential,
} from '@/actions/invoice'

export type InvoiceCredentialMode = 'create' | 'edit'

export interface ExistingCredential {
  id: string
  barcode: string
  nickname: string | null
}

interface Props {
  open: boolean
  mode: InvoiceCredentialMode
  /** When mode === 'edit', the row being edited. */
  initial?: ExistingCredential
  onClose: () => void
  /** Called after a successful mutation; parent refreshes data. */
  onSaved: () => void
}

/**
 * Bottom sheet for binding / editing a 雲端發票 mobile-barcode carrier.
 *
 * Create mode  — barcode + verification code + optional nickname.
 * Edit mode    — barcode is read-only (delete + recreate to swap), nickname
 *                editable inline, verification code optional (only refreshed
 *                when filled), explicit "移除載具" button.
 *
 * Validation is mirrored client-side (cheap UX) but the server is the source
 * of truth — hence the surfaced server error string.
 */
export function InvoiceCredentialSheet({ open, mode, initial, onClose, onSaved }: Props) {
  const [barcode, setBarcode] = useState('')
  const [code, setCode] = useState('')
  const [nickname, setNickname] = useState('')
  const [showCode, setShowCode] = useState(false)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const [keyboardOffset, setKeyboardOffset] = useState(0)
  const barcodeRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    if (mode === 'edit' && initial) {
      setBarcode(initial.barcode)
      setNickname(initial.nickname ?? '')
    } else {
      setBarcode('')
      setNickname('')
    }
    setCode('')
    setError('')
    setShowCode(false)
  }, [open, mode, initial])

  useFocusAndSelectOnOpen(open && mode === 'create', barcodeRef)
  useFocusAndSelectOnOpen(open && mode === 'edit', codeRef)

  // Push the sheet up when the soft keyboard appears (mirror EditTextSheet).
  useEffect(() => {
    if (!open) { setKeyboardOffset(0); return }
    const vv = window.visualViewport
    if (!vv) return
    const update = () =>
      setKeyboardOffset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    update()
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [open])

  // ── Helpers ──────────────────────────────────────────────────────────────
  /** Normalize barcode input — uppercase, force leading slash if missing. */
  const handleBarcodeChange = (v: string) => {
    let s = v.trim().toUpperCase()
    if (s.length > 0 && !s.startsWith('/')) s = '/' + s
    setBarcode(s.slice(0, 8))
    setError('')
  }

  const handleSave = () => {
    setError('')
    startTransition(async () => {
      try {
        if (mode === 'create') {
          await createInvoiceCredential({
            barcode,
            verificationCode: code,
            nickname: nickname.trim() || null,
          })
        } else {
          if (!initial) throw new Error('缺少載具資料')
          // Rename always — even if unchanged, this is a noop server-side.
          await renameInvoiceCredential(initial.id, nickname.trim() || null)
          // Refresh code only if user typed a new one.
          if (code.trim().length > 0) {
            await refreshInvoiceCredential(initial.id, code)
          }
        }
        onSaved()
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : '儲存失敗')
      }
    })
  }

  const handleDelete = () => {
    if (!initial) return
    if (!confirm('確定要移除此載具嗎？已匯入的紀錄會保留。')) return
    setError('')
    startTransition(async () => {
      try {
        await deleteInvoiceCredential(initial.id)
        onSaved()
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : '移除失敗')
      }
    })
  }

  // Save-button state: in create mode require both fields; in edit mode
  // allow saving even with code blank (nickname-only edit).
  const canSave =
    mode === 'create'
      ? barcode.length === 8 && code.length === 8
      : (code.length === 0 || code.length === 8)

  return (
    <>
      <SheetBackdrop open={open} onClick={pending ? () => {} : onClose} />
      <div
        className="fixed left-1/2 -translate-x-1/2 w-full max-w-md z-[100] flex flex-col overflow-hidden"
        style={{
          background: 'var(--bg)',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          boxShadow: '0 -10px 40px rgba(0,0,0,0.18)',
          bottom: keyboardOffset,
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)',
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        {/* Grabber */}
        <div className="pt-2 flex justify-center">
          <div className="w-9 h-[5px] rounded-full" style={{ background: 'rgba(31,27,22,0.18)' }} />
        </div>

        {/* Header: 取消 / title / 完成 */}
        <div className="flex items-center justify-between px-5 pt-3 pb-4">
          <button
            onClick={pending ? undefined : onClose}
            disabled={pending}
            className="bg-transparent border-0 text-body cursor-pointer p-1 disabled:opacity-50"
            style={{ color: 'var(--ink-2)' }}
          >
            取消
          </button>
          <span className="text-body font-semibold" style={{ color: 'var(--ink)' }}>
            {mode === 'create' ? '加入手機條碼' : '編輯載具'}
          </span>
          <button
            onClick={handleSave}
            disabled={pending || !canSave}
            className="bg-transparent border-0 text-body font-semibold cursor-pointer p-1 disabled:opacity-50"
            style={{ color: 'var(--accent)' }}
          >
            {pending ? '儲存中…' : '完成'}
          </button>
        </div>

        <div className="px-5 pb-6 flex flex-col gap-4">
          {mode === 'create' && (
            <div className="text-xs leading-relaxed" style={{ color: 'var(--ink-3)' }}>
              嗶過手機條碼的發票會自動上雲。綁定一次，之後可以一鍵把這些花費整理進來。
            </div>
          )}

          {/* Barcode */}
          <Field label="手機條碼">
            <input
              ref={barcodeRef}
              type="text"
              value={barcode}
              maxLength={8}
              autoCapitalize="characters"
              onChange={(e) => handleBarcodeChange(e.target.value)}
              placeholder="/AB12CD3"
              disabled={mode === 'edit'}
              className="w-full h-12 px-3 rounded-xl outline-none disabled:opacity-60"
              style={{
                fontSize: 16,
                border: '1px solid var(--hairline)',
                color: 'var(--ink)',
                background: mode === 'edit' ? 'var(--bg)' : 'var(--surface)',
                fontFamily: 'inherit',
              }}
            />
            {mode === 'edit' && (
              <Hint>條碼不可修改，需要更換請先「移除」再重新加入。</Hint>
            )}
          </Field>

          {/* Verification code */}
          <Field label={mode === 'create' ? '驗證碼' : '更新驗證碼（選填）'}>
            <div className="relative">
              <input
                ref={codeRef}
                type={showCode ? 'text' : 'password'}
                value={code}
                maxLength={8}
                autoCapitalize="characters"
                autoComplete="off"
                onChange={(e) => { setCode(e.target.value.trim().toUpperCase().slice(0, 8)); setError('') }}
                placeholder="8 字英數"
                className="w-full h-12 px-3 pr-12 rounded-xl outline-none"
                style={{
                  fontSize: 16,
                  border: '1px solid var(--hairline)',
                  color: 'var(--ink)',
                  background: 'var(--surface)',
                  fontFamily: 'inherit',
                  letterSpacing: showCode ? 1 : 4,
                }}
              />
              <button
                type="button"
                onClick={() => setShowCode((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-micro px-2 py-1 bg-transparent border-0 cursor-pointer"
                style={{ color: 'var(--ink-3)' }}
              >
                {showCode ? '隱藏' : '顯示'}
              </button>
            </div>
            {mode === 'edit' && (
              <Hint>留空則不更動驗證碼，只會更新暱稱。</Hint>
            )}
          </Field>

          {/* Nickname */}
          <Field label="暱稱（選填）">
            <input
              type="text"
              value={nickname}
              maxLength={16}
              onChange={(e) => { setNickname(e.target.value); setError('') }}
              placeholder="我的 / 老婆的"
              className="w-full h-12 px-3 rounded-xl outline-none"
              style={{
                fontSize: 16,
                border: '1px solid var(--hairline)',
                color: 'var(--ink)',
                background: 'var(--surface)',
                fontFamily: 'inherit',
              }}
            />
          </Field>

          {error && (
            <div className="text-micro px-1" style={{ color: 'var(--debit)' }}>{error}</div>
          )}

          {mode === 'edit' && initial && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={pending}
              className="mt-2 w-full h-12 rounded-[14px] border-0 text-sm font-semibold cursor-pointer disabled:opacity-50"
              style={{ background: 'transparent', color: 'var(--debit)', border: '1px solid var(--hairline)' }}
            >
              移除載具
            </button>
          )}
        </div>
      </div>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs px-1 pb-2" style={{ color: 'var(--ink-3)' }}>{label}</div>
      {children}
    </div>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-micro mt-1.5 px-1" style={{ color: 'var(--ink-3)' }}>{children}</div>
  )
}
