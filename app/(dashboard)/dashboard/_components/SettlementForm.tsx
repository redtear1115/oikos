'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { CalIcon, Chevron } from '@/app/(dashboard)/_components/sheet-icons'
import { createSettlement } from '@/actions/settlement'
import { settlementChips } from '@/lib/settlement'
import { MiniCalendar } from './MiniCalendar'
import { localTodayISO, ymdToUTCNoon, dateLabel, weekday } from '@/lib/local-date'

interface Props {
  /** Absolute outstanding debt from VIEWER's perspective (always positive). */
  debtAmount: number
  /** True if viewer owes partner (viewer is debtor). False if viewer is owed. */
  viewerIsDebtor: boolean
  onClose: () => void
  onMutated: () => void
}

export function SettlementForm({ debtAmount, viewerIsDebtor, onClose, onMutated }: Props) {
  const { viewer, partner } = useMember()
  // Default to the full outstanding amount.
  const [amount, setAmount] = useState(String(debtAmount))
  const [date, setDate] = useState(localTodayISO())
  const [showCal, setShowCal] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setAmount(String(debtAmount))
    setDate(localTodayISO())
    setShowCal(false)
    setError('')
  }, [debtAmount])

  // Component mounts exactly when the settle panel opens — focus once on mount.
  useEffect(() => {
    const t = setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 250)
    return () => clearTimeout(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const chips = settlementChips(debtAmount)
  const parsed = parseInt(amount, 10) || 0

  const title = viewerIsDebtor
    ? '我還多少？'
    : `${partner?.displayName ?? '對方'} 還了 多少？`
  const primaryText = viewerIsDebtor ? '記錄還款' : '記錄收款'

  const handleConfirm = () => {
    if (!parsed || parsed <= 0) { setError('請輸入金額'); return }
    if (parsed > debtAmount) { setError('金額不能超過欠款'); return }
    if (!viewerIsDebtor && !partner) { setError('伴侶尚未加入'); return }
    // Settlement payer = whoever owes (paying down their debt).
    const payerId = viewerIsDebtor ? viewer.id : partner!.id
    startTransition(async () => {
      try {
        await createSettlement({
          amount: parsed,
          payerId,
          settledAt: ymdToUTCNoon(date),
        })
        onMutated()
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : '發生錯誤')
      }
    })
  }

  return (
    <div className="px-5 pt-2 pb-5">
      <div
        className="rounded-[18px] p-5"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
      >
        <div className="flex items-center gap-2 text-xs mb-3" style={{ color: 'var(--ink-3)' }}>
          <Avatar
            who={viewerIsDebtor ? 'M' : 'T'}
            initial={viewerIsDebtor ? viewer.initial : (partner?.initial ?? '?')}
            src={viewerIsDebtor ? viewer.avatarUrl : (partner?.avatarUrl ?? null)}
            size={20}
          />
          <span>{title}</span>
        </div>

        <label
          className="flex items-baseline justify-center gap-1.5 min-h-[56px] cursor-text"
          onClick={() => {
            const el = inputRef.current
            if (!el) return
            el.focus()
            el.select()
          }}
        >
          <span className="text-button font-medium" style={{ color: 'var(--ink-2)' }}>NT$</span>
          <input
            ref={inputRef}
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
            className="tnum tracking-[-1.5px] leading-none bg-transparent border-0 outline-none text-center"
            style={{
              fontFamily: 'var(--font-numeric)',
              fontSize: 'var(--fs-amount-md)',
              fontWeight: 600,
              color: amount ? 'var(--ink)' : 'var(--ink-3)',
              width: `${Math.max(amount.length || 1, 2)}ch`,
              caretColor: 'var(--accent)',
            }}
          />
        </label>

        {chips.length > 0 && (
          <div className="flex gap-2 justify-center mt-3 flex-wrap">
            {chips.map((c) => {
              const isActive = parsed === c.value
              return (
                <button
                  key={c.label}
                  onClick={() => setAmount(String(c.value))}
                  className="h-8 px-3 rounded-full text-xs font-medium cursor-pointer transition-colors"
                  style={{
                    background: isActive ? 'var(--ink)' : 'var(--bg)',
                    color: isActive ? '#fff' : 'var(--ink-2)',
                    border: '1px solid var(--hairline)',
                  }}
                >
                  {c.label} · {c.value.toLocaleString('en-US')}
                </button>
              )
            })}
          </div>
        )}

        {/* Date picker */}
        <div className="mt-4">
          <button
            onClick={() => setShowCal(v => !v)}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[12px] cursor-pointer text-left"
            style={{ background: 'var(--bg)', border: '1px solid var(--hairline)' }}
          >
            <CalIcon size={20} />
            <div className="flex-1 text-left">
              <div className="text-label font-medium" style={{ color: 'var(--ink)' }}>
                {dateLabel(date)}
              </div>
              <div className="text-micro mt-0.5" style={{ color: 'var(--ink-3)' }}>
                {date === localTodayISO() ? '今天' : weekday(date)}
              </div>
            </div>
            <Chevron />
          </button>
          {showCal && (
            <MiniCalendar value={date} onChange={d => { setDate(d); setShowCal(false) }} />
          )}
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={handleConfirm}
            disabled={!parsed || pending}
            className="flex-1 h-[46px] rounded-xl border-0 text-white font-semibold text-sm tracking-[0.3px] cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            {pending ? '處理中…' : `${primaryText} NT$${parsed.toLocaleString('en-US')}`}
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

        {error && (
          <div className="mt-3 text-xs" style={{ color: 'var(--debit)' }}>
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
