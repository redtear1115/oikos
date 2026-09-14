'use client'

import { useState, useEffect, useId, useRef, useTransition } from 'react'
import { SheetBackdrop } from '@/app/(dashboard)/dashboard/_components/SheetBackdrop'
import { useFocusAndSelectOnOpen } from './useFocusAndSelectOnOpen'
import { useFocusTrap } from './useFocusTrap'
import { useDirtyCheck, useUnsavedChangesGuard } from './useUnsavedChangesGuard'
import { useTranslations } from '@/lib/i18n/client'
import { describeError } from '@/lib/errors'

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
  /** iOS autocapitalize attribute. Defaults to browser default ('sentences'). */
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'
}

export function EditTextSheet({
  open, title, initialValue, onSubmit, onClose,
  placeholder, maxLength = 32, autoCapitalize,
}: Props) {
  const t = useTranslations()
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const [keyboardOffset, setKeyboardOffset] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    setValue(initialValue)
    setError('')
  }, [open, initialValue])

  // This sheet hand-rolls its panel instead of using SheetFrame because it
  // rides the soft keyboard (`bottom: keyboardOffset`), which SheetFrame's
  // fixed `bottom-0` can't express. So it opts into SheetFrame's dialog rules
  // itself: trap Tab while open, restore focus to the trigger on close, and
  // `inert` + no dialog role while closed (#1197, mirrors SheetFrame #1176).
  // Symptom if this goes: nothing errors, but Tab walks out of the open sheet
  // onto the settings page behind it, and after 完成 / 取消 / Escape focus
  // lands on <body> instead of the row that opened the sheet.
  useFocusTrap(open, panelRef)

  useFocusAndSelectOnOpen(open, inputRef)

  // Backdrop / Escape / Back ask before dropping an edited value (#1183);
  // 取消 still closes straight away.
  const isDirty = useDirtyCheck(open, value)
  const { requestClose, confirm } = useUnsavedChangesGuard(open, onClose, isDirty)

  // Dismiss the iOS soft keyboard on close — same reason as SheetFrame: the
  // focus restore alone doesn't reliably blur the input on iOS.
  useEffect(() => {
    if (open) return
    const panel = panelRef.current
    if (!panel) return
    const active = document.activeElement
    if (active instanceof HTMLElement && panel.contains(active)) {
      active.blur()
    }
  }, [open])

  // Push sheet up when the soft keyboard appears
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

  const handleConfirm = () => {
    const trimmed = value.trim()
    if (!trimmed) { setError(t.editTextSheet.errorEmpty); return }
    startTransition(async () => {
      try {
        await onSubmit(trimmed)
        onClose()
      } catch (e) {
        setError(describeError(e, t.editTextSheet.saveFailed, t.common.offlineError, t.errors.actions))
      }
    })
  }

  return (
    <>
      <SheetBackdrop open={open} onClick={pending ? () => false : requestClose} />
      {confirm}
      <div
        ref={panelRef}
        // Dialog semantics only while open; the closed panel stays mounted for
        // the slide-down and is kept out of Tab order / the a11y tree by inert.
        {...(open ? { role: 'dialog', 'aria-modal': true as const, 'aria-labelledby': titleId } : {})}
        inert={!open}
        className="fixed left-1/2 -translate-x-1/2 w-full max-w-md z-sheet flex flex-col overflow-hidden"
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
            className="bg-transparent border-0 text-base cursor-pointer p-1 disabled:opacity-50"
            style={{ color: 'var(--ink-2)' }}
          >
            {t.common.cancel}
          </button>
          <span id={titleId} className="text-base font-medium" style={{ color: 'var(--ink)' }}>
            {title}
          </span>
          <button
            onClick={handleConfirm}
            disabled={pending || !value.trim()}
            className="bg-transparent border-0 text-base font-medium cursor-pointer p-1 disabled:opacity-50"
            style={{ color: 'var(--accent)' }}
          >
            {pending ? t.common.saving : t.common.done}
          </button>
        </div>

        {/* Input + error + char count */}
        <div className="px-5 pb-6">
          <input
            ref={inputRef}
            type="text"
            value={value}
            maxLength={maxLength}
            autoCapitalize={autoCapitalize}
            onChange={(e) => { setValue(e.target.value); setError('') }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !pending) { e.preventDefault(); handleConfirm() }
            }}
            placeholder={placeholder ?? title}
            className="w-full h-12 px-3 rounded-xl outline-none text-base"
            style={{
              border: '1px solid var(--hairline)',
              color: 'var(--ink)',
              background: 'var(--surface)',
              fontFamily: 'inherit',
            }}
          />
          {error && (
            <div className="text-xs mt-2" style={{ color: 'var(--debit-text)' }}>{error}</div>
          )}
          <div className="text-xs mt-1.5 text-right" style={{ color: 'var(--ink-3)' }}>
            {value.length} / {maxLength}
          </div>
        </div>
      </div>
    </>
  )
}
