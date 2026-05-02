'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { SheetBackdrop } from './SheetBackdrop'
import { createTransaction, editTransaction, softDeleteTransaction } from '@/actions/transaction'
import { PICKABLE_CATEGORIES } from '@/lib/categories'
import type { CategoryId } from '@/lib/categories'
import type { SplitType } from '@/lib/balance'
import { SplitGlyph } from './SplitGlyph'
import { MiniCalendar } from './MiniCalendar'

export interface AddSheetInitial {
  id: string
  amount: number
  description: string
  category: string
  splitType: SplitType
  payerId: string
  transactedAt: string  // ISO
}

interface Props {
  open: boolean
  onClose: () => void
  initial?: AddSheetInitial
  /** Called after a successful create/edit/delete. Caller refreshes its own data. */
  onMutated?: () => void
}

const TODAY_ISO = () => new Date().toISOString().slice(0, 10)

function dateLabel(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return `${y} 年 ${m} 月 ${d} 日`
}

function weekday(iso: string) {
  const days = ['週日','週一','週二','週三','週四','週五','週六']
  return days[new Date(iso + 'T00:00:00').getDay()]
}

/** Split-type subtitle, payer-relative (matches storage semantics in lib/balance.ts). */
function splitSub(splitId: SplitType, payerWho: 'M' | 'T', amount: number): string {
  if (splitId === 'all_mine') {
    return payerWho === 'M' ? '你自己花的，不會欠款' : '對方自己花的，不會欠款'
  }
  if (splitId === 'all_theirs') {
    if (!amount) return payerWho === 'M' ? '對方欠你全額' : '你欠對方全額'
    return payerWho === 'M'
      ? `對方欠你 NT$${amount.toLocaleString('en-US')}`
      : `你欠對方 NT$${amount.toLocaleString('en-US')}`
  }
  // half
  if (!amount) return '各付一半'
  const half = Math.ceil(amount / 2)
  return payerWho === 'M'
    ? `對方欠你 NT$${half.toLocaleString('en-US')}`
    : `你欠對方 NT$${half.toLocaleString('en-US')}`
}

function DescIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M4 6h14M4 11h14M4 16h9" stroke="#9A9085" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  )
}

function CalIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <rect x="3" y="5" width="16" height="14" rx="3" stroke="#5C544A" strokeWidth="1.5"/>
      <path d="M3 9h16" stroke="#5C544A" strokeWidth="1.5"/>
      <path d="M7 3v4M15 3v4" stroke="#5C544A" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

function Chevron() {
  return (
    <svg width="7" height="12" viewBox="0 0 7 12" fill="none">
      <path d="M1 1l5 5-5 5" stroke="var(--ink-3)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function AddSheet({ open, onClose, initial, onMutated }: Props) {
  const { viewer, partner } = useMember()
  const [amount, setAmount] = useState('')
  const [desc, setDesc] = useState('')
  const [category, setCategory] = useState<CategoryId>('food')
  const [split, setSplit] = useState<SplitType>('half')
  const [payerWho, setPayerWho] = useState<'M' | 'T'>('M')
  const [date, setDate] = useState(TODAY_ISO())
  const [showCal, setShowCal] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const amountInputRef = useRef<HTMLInputElement>(null)

  // Reset / prefill on open. Re-runs if `initial` changes.
  useEffect(() => {
    if (!open) return
    if (initial) {
      setAmount(String(initial.amount))
      setDesc(initial.description)
      setCategory(
        (PICKABLE_CATEGORIES.find((c) => c.id === initial.category)?.id as CategoryId) ?? 'food',
      )
      setSplit(initial.splitType)
      setPayerWho(initial.payerId === viewer.id ? 'M' : 'T')
      setDate(initial.transactedAt.slice(0, 10))
    } else {
      setAmount('')
      setDesc('')
      setCategory('food')
      setSplit('half')
      setPayerWho('M')
      setDate(TODAY_ISO())
    }
    setShowCal(false)
    setError('')
    const t = setTimeout(() => amountInputRef.current?.focus(), 350)
    return () => clearTimeout(t)
  }, [open, initial, viewer.id])

  const isEdit = !!initial

  const handleSave = () => {
    const n = parseInt(amount, 10)
    if (!n || n <= 0) { setError('請輸入金額'); return }
    if (!desc.trim()) { setError('請輸入描述'); return }
    if (payerWho === 'T' && !partner) { setError('伴侶尚未加入'); return }
    const payerId = payerWho === 'M' ? viewer.id : partner!.id
    const transactedAt = new Date(date + 'T00:00:00')

    startTransition(async () => {
      try {
        if (isEdit) {
          await editTransaction({
            oldId: initial!.id,
            amount: n,
            description: desc,
            category,
            splitType: split,
            payerId,
            transactedAt,
          })
        } else {
          await createTransaction({
            amount: n,
            description: desc,
            category,
            splitType: split,
            payerId,
            transactedAt,
          })
        }
        onMutated?.()
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : '發生錯誤')
      }
    })
  }

  const handleDelete = () => {
    if (!isEdit) return
    if (!confirm('確定刪除這筆？')) return
    startTransition(async () => {
      try {
        await softDeleteTransaction(initial!.id)
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
          <div
            className="w-9 h-[5px] rounded-full"
            style={{ background: 'rgba(31,27,22,0.18)' }}
          />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-3 pb-2">
          <button
            onClick={onClose}
            className="bg-transparent border-0 text-[15px] cursor-pointer p-1"
            style={{ color: 'var(--ink-2)' }}
          >
            取消
          </button>
          <div
            className="text-base font-semibold tracking-wide"
            style={{ color: 'var(--ink)' }}
          >
            {isEdit ? '編輯紀錄' : '新增紀錄'}
          </div>
          <button
            onClick={handleSave}
            disabled={!amount || pending}
            className="bg-transparent border-0 text-[15px] font-semibold p-1 cursor-pointer disabled:cursor-default"
            style={{
              color:
                amount && !pending ? 'var(--accent)' : 'var(--ink-3)',
            }}
          >
            {pending ? '儲存中…' : '儲存'}
          </button>
        </div>

        <div className="overflow-auto flex-1">
          {/* Amount + payer toggle */}
          <div
            className="px-6 pt-6 pb-7 text-center"
            style={{ borderBottom: '1px solid var(--hairline)' }}
          >
            <div
              className="text-xs tracking-[0.6px] mb-3"
              style={{ color: 'var(--ink-3)' }}
            >
              金額
            </div>
            <div className="flex items-baseline justify-center gap-1.5 min-h-[60px]">
              <span
                className="text-[22px] font-medium"
                style={{ color: amount ? 'var(--ink-2)' : 'var(--ink-3)' }}
              >
                NT$
              </span>
              <input
                ref={amountInputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                enterKeyHint="done"
                value={amount}
                onChange={(e) => {
                  // strip non-digits, drop leading zeros, cap at 7 digits
                  const next = e.target.value.replace(/[^0-9]/g, '').slice(0, 7).replace(/^0+(\d)/, '$1')
                  setAmount(next)
                }}
                placeholder="0"
                aria-label="金額"
                className="tnum tracking-[-2px] leading-none bg-transparent border-0 outline-none text-center"
                style={{
                  fontFamily: 'var(--font-numeric)',
                  fontSize: 56,
                  fontWeight: 600,
                  color: amount ? 'var(--ink)' : 'var(--ink-3)',
                  width: `${Math.max(amount.length || 1, 1)}ch`,
                  caretColor: 'var(--accent)',
                }}
              />
            </div>

            {/* Payer segmented */}
            <div
              className="mt-[22px] flex items-center justify-center gap-2.5 text-[13px]"
              style={{ color: 'var(--ink-2)' }}
            >
              <span>誰付的？</span>
              <div
                className="inline-flex rounded-full p-[3px] gap-0.5"
                style={{ background: 'rgba(31,27,22,0.05)' }}
              >
                {(['M', 'T'] as const).map((w) => (
                  <button
                    key={w}
                    onClick={() => setPayerWho(w)}
                    className="h-7 px-3.5 rounded-full border-0 text-[13px] font-medium cursor-pointer flex items-center gap-1.5 transition-all duration-150"
                    style={{
                      background:
                        payerWho === w ? 'var(--surface)' : 'transparent',
                      color: payerWho === w ? 'var(--ink)' : 'var(--ink-2)',
                      boxShadow:
                        payerWho === w
                          ? '0 1px 3px rgba(31,27,22,0.10)'
                          : 'none',
                    }}
                  >
                    <Avatar
                      who={w}
                      initial={
                        w === 'M' ? viewer.initial : partner?.initial ?? '?'
                      }
                      size={18}
                    />
                    {w === 'M' ? '我' : '對方'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="px-5 py-3.5 flex items-center gap-3.5"
            style={{ borderBottom: '1px solid var(--hairline)' }}>
            <DescIcon />
            <input
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="描述（例：晚餐、雜貨）"
              className="flex-1 bg-transparent border-0 outline-none text-base py-1"
              style={{ color: 'var(--ink)' }}
            />
          </div>

          {/* Categories */}
          <div className="pt-5 pb-[18px]">
            <div className="text-xs tracking-[0.6px] px-6 pb-3" style={{ color: 'var(--ink-3)' }}>
              分類
            </div>
            <div className="flex gap-2 px-5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              {PICKABLE_CATEGORIES.map(c => {
                const sel = category === c.id
                return (
                  <button key={c.id} onClick={() => setCategory(c.id)}
                    className="h-[38px] pl-2 pr-3 rounded-full text-sm font-medium inline-flex items-center gap-2 cursor-pointer shrink-0 transition-all duration-150"
                    style={{
                      background: sel ? 'var(--ink)' : 'var(--surface)',
                      color: sel ? '#fff' : 'var(--ink)',
                      border: sel ? '1px solid var(--ink)' : '1px solid var(--hairline)',
                    }}>
                    <span className="w-6 h-6 rounded-[7px] inline-flex items-center justify-center text-[13px] font-medium"
                      style={{ background: c.tint, color: c.ink }}>
                      {c.mono}
                    </span>
                    {c.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Split type */}
          <div className="px-5 pt-2 pb-[18px] mt-1"
            style={{ borderTop: '1px solid var(--hairline)' }}>
            <div className="text-xs tracking-[0.6px] px-1 py-3" style={{ color: 'var(--ink-3)' }}>
              分攤方式
            </div>
            <div className="flex flex-col gap-2">
              {([
                { id: 'all_mine',   label: '全部我的',   sub: splitSub('all_mine',   payerWho, parseInt(amount, 10) || 0) },
                { id: 'all_theirs', label: '全部對方的', sub: splitSub('all_theirs', payerWho, parseInt(amount, 10) || 0) },
                { id: 'half',       label: '平分',       sub: splitSub('half',       payerWho, parseInt(amount, 10) || 0) },
              ] as const).map(s => {
                const sel = split === s.id
                return (
                  <button key={s.id} onClick={() => setSplit(s.id)}
                    className="flex items-center gap-3 px-3.5 py-3 rounded-[14px] cursor-pointer text-left transition-all duration-150"
                    style={{
                      background: 'var(--surface)',
                      border: sel ? '1.5px solid var(--ink)' : '1px solid var(--hairline)',
                    }}>
                    <SplitGlyph kind={s.id} active={sel} />
                    <div className="flex-1">
                      <div className="text-[15px] font-medium tracking-tight" style={{ color: 'var(--ink)' }}>
                        {s.label}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>{s.sub}</div>
                    </div>
                    <div className="w-5 h-5 rounded-full transition-all duration-150"
                      style={{
                        border: sel ? '6px solid var(--ink)' : '1.5px solid var(--hairline)',
                        background: sel ? 'var(--ink)' : 'transparent',
                        boxShadow: sel ? 'inset 0 0 0 3px var(--surface)' : 'none',
                      }} />
                  </button>
                )
              })}
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
                  {date === TODAY_ISO() ? '今天' : weekday(date)}
                </div>
              </div>
              <Chevron />
            </button>
            {showCal && <MiniCalendar value={date} onChange={d => { setDate(d); setShowCal(false) }} />}
          </div>

          {isEdit && (
            <div className="px-5 pb-2">
              <button
                onClick={handleDelete}
                disabled={pending}
                className="w-full h-12 rounded-[14px] border-0 cursor-pointer text-sm font-medium disabled:opacity-50"
                style={{
                  background: 'transparent',
                  color: '#B85A48',
                  border: '1px solid rgba(184, 90, 72, 0.25)',
                }}
              >
                刪除這筆
              </button>
            </div>
          )}

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
    </>
  )
}
