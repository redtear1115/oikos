'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { CalIcon, Chevron } from '@/app/(dashboard)/_components/sheet-icons'
import { ConfirmModal } from '@/app/(dashboard)/_components/ConfirmModal'
import { SheetBackdrop } from './SheetBackdrop'
import { MiniCalendar } from './MiniCalendar'
import { editSettlement, softDeleteSettlement } from '@/actions/settlement'
import { localTodayISO, ymdToUTCNoon } from '@/lib/local-date'

export interface SettlementSheetInitial {
  id: string
  amount: number
  payerId: string
  settledAt: string  // ISO
}

interface Props {
  open: boolean
  onClose: () => void
  initial: SettlementSheetInitial | null
  onMutated?: () => void
}

function dateLabel(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return `${y} 年 ${m} 月 ${d} 日`
}

function weekday(iso: string) {
  const days = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']
  return days[new Date(iso + 'T00:00:00').getDay()]
}

export function SettlementSheet({ open, onClose, initial, onMutated }: Props) {
  const { viewer, partner } = useMember()
  const [amount, setAmount] = useState('')
  const [payerWho, setPayerWho] = useState<'M' | 'T'>('M')
  const [date, setDate] = useState(localTodayISO())
  const [showCal, setShowCal] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const amountInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open || !initial) return
    setAmount(String(initial.amount))
    setPayerWho(initial.payerId === viewer.id ? 'M' : 'T')
    // Use local Y/M/D components for prefill so a UTC-noon stored date displays as the
    // user's intended date in the picker.
    const dt = new Date(initial.settledAt)
    setDate(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`)
    setShowCal(false)
    setError('')
    const t = setTimeout(() => {
      const el = amountInputRef.current
      if (!el) return
      el.focus()
      el.select()
    }, 350)
    return () => clearTimeout(t)
  }, [open, initial, viewer.id])

  const handleSave = () => {
    if (!initial) return
    const n = parseInt(amount, 10)
    if (!n || n <= 0) { setError('請輸入金額'); return }
    if (payerWho === 'T' && !partner) { setError('伴侶尚未加入'); return }
    const payerId = payerWho === 'M' ? viewer.id : partner!.id
    startTransition(async () => {
      try {
        await editSettlement({
          oldId: initial.id,
          amount: n,
          payerId,
          settledAt: ymdToUTCNoon(date),
        })
        onMutated?.()
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : '發生錯誤')
      }
    })
  }

  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const performDelete = () => {
    if (!initial) return
    setConfirmingDelete(false)
    startTransition(async () => {
      try {
        await softDeleteSettlement(initial.id)
        onMutated?.()
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : '發生錯誤')
      }
    })
  }

  return (
    <>
      <SheetBackdrop open={open} onClick={onClose} />
      <div
        className="fixed left-1/2 bottom-0 z-[100] w-full max-w-md -translate-x-1/2 flex flex-col overflow-hidden"
        style={{
          background: 'var(--bg)',
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          boxShadow: '0 -10px 40px rgba(0,0,0,0.18)',
          maxHeight: '92dvh',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)',
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        {/* Grabber */}
        <div className="pt-2 flex justify-center">
          <div className="w-9 h-[5px] rounded-full" style={{ background: 'rgba(31,27,22,0.18)' }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-3 pb-2">
          <button onClick={onClose}
            className="bg-transparent border-0 text-[15px] cursor-pointer p-1"
            style={{ color: 'var(--ink-2)' }}>取消</button>
          <div className="text-base font-semibold tracking-wide" style={{ color: 'var(--ink)' }}>
            編輯還款
          </div>
          <button onClick={handleSave} disabled={!amount || pending}
            className="bg-transparent border-0 text-[15px] font-semibold p-1 cursor-pointer disabled:cursor-default"
            style={{ color: amount && !pending ? 'var(--accent)' : 'var(--ink-3)' }}>
            {pending ? '儲存中…' : '儲存'}
          </button>
        </div>

        <div className="overflow-auto flex-1">
          {/* Amount + payer */}
          <div className="px-6 pt-6 pb-7 text-center"
            style={{ borderBottom: '1px solid var(--hairline)' }}>
            <div className="text-xs tracking-[0.6px] mb-3" style={{ color: 'var(--ink-3)' }}>
              金額
            </div>
            <label
              className="flex items-baseline justify-center gap-1.5 min-h-[60px] cursor-text"
              onClick={() => {
                const el = amountInputRef.current
                if (!el) return
                el.focus()
                el.select()
              }}
            >
              <span className="text-[22px] font-medium"
                style={{ color: amount ? 'var(--ink-2)' : 'var(--ink-3)' }}>NT$</span>
              <input
                ref={amountInputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                enterKeyHint="done"
                value={amount}
                onChange={(e) => {
                  const next = e.target.value.replace(/[^0-9]/g, '').slice(0, 7).replace(/^0+(\d)/, '$1')
                  setAmount(next)
                }}
                placeholder="0"
                aria-label="還款金額"
                className="tnum tracking-[-2px] leading-none bg-transparent border-0 outline-none text-center"
                style={{
                  fontFamily: 'var(--font-numeric)',
                  fontSize: 56,
                  fontWeight: 600,
                  color: amount ? 'var(--ink)' : 'var(--ink-3)',
                  width: `${Math.max(amount.length || 1, 2)}ch`,
                  caretColor: 'var(--accent)',
                }}
              />
            </label>

            <div className="mt-[22px] flex items-center justify-center gap-2.5 text-[13px]"
              style={{ color: 'var(--ink-2)' }}>
              <span>誰付的？</span>
              <div className="inline-flex rounded-full p-[3px] gap-0.5"
                style={{ background: 'rgba(31,27,22,0.05)' }}>
                {(['M', 'T'] as const).map((w) => (
                  <button key={w} onClick={() => setPayerWho(w)}
                    className="h-7 px-3.5 rounded-full border-0 text-[13px] font-medium cursor-pointer flex items-center gap-1.5 transition-all duration-150"
                    style={{
                      background: payerWho === w ? 'var(--surface)' : 'transparent',
                      color: payerWho === w ? 'var(--ink)' : 'var(--ink-2)',
                      boxShadow: payerWho === w ? '0 1px 3px rgba(31,27,22,0.10)' : 'none',
                    }}>
                    <Avatar
                      who={w}
                      initial={w === 'M' ? viewer.initial : partner?.initial ?? '?'}
                      src={w === 'M' ? viewer.avatarUrl : partner?.avatarUrl ?? null}
                      size={18}
                    />
                    {w === 'M' ? '我' : '對方'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Date */}
          <div className="px-5 pt-1 pb-6">
            <div className="text-xs tracking-[0.6px] px-1 py-3" style={{ color: 'var(--ink-3)' }}>
              日期
            </div>
            <button onClick={() => setShowCal(v => !v)}
              className="w-full flex items-center gap-3 px-3.5 py-3 rounded-[14px] cursor-pointer text-left"
              style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
              <CalIcon />
              <div className="flex-1 text-left">
                <div className="text-[15px] font-medium" style={{ color: 'var(--ink)' }}>
                  {dateLabel(date)}
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
                  {date === localTodayISO() ? '今天' : weekday(date)}
                </div>
              </div>
              <Chevron />
            </button>
            {showCal && <MiniCalendar value={date} onChange={d => { setDate(d); setShowCal(false) }} />}
          </div>

          {/* Delete */}
          <div className="px-5 pb-2">
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              disabled={pending}
              className="w-full h-12 rounded-[14px] border-0 cursor-pointer text-sm font-medium disabled:opacity-50"
              style={{
                background: 'transparent',
                color: 'var(--destructive)',
                border: '1px solid var(--destructive-soft)',
              }}
            >
              刪除這筆
            </button>
          </div>

          <div className="h-6" />
        </div>
      </div>

      {error && open && (
        <div
          className="fixed left-1/2 top-4 z-[110] -translate-x-1/2 w-[calc(100%-32px)] max-w-[calc(28rem-32px)] px-4 py-3 rounded-xl text-sm text-white"
          style={{ background: 'var(--debit)' }}
        >
          {error}
        </div>
      )}

      <ConfirmModal
        open={confirmingDelete && open}
        title="刪除這筆還款？"
        description="這個動作無法復原，但帳本歷史會保留 30 天可由開發者還原。"
        confirmLabel="刪除"
        pending={pending}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={performDelete}
      />
    </>
  )
}
