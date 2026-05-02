'use client'

import { useState, useEffect, useTransition } from 'react'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { SheetBackdrop } from './SheetBackdrop'
import { createTransaction } from '@/actions/transaction'
import { PICKABLE_CATEGORIES } from '@/lib/categories'
import type { CategoryId } from '@/lib/categories'
import type { SplitType } from '@/lib/balance'
import { SplitGlyph } from './SplitGlyph'
import { MiniCalendar } from './MiniCalendar'
import { Numpad } from './Numpad'

interface Props {
  open: boolean
  onClose: () => void
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

export function AddSheet({ open, onClose }: Props) {
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

  // Reset on open
  useEffect(() => {
    if (open) {
      setAmount('')
      setDesc('')
      setCategory('food')
      setSplit('half')
      setPayerWho('M')
      setDate(TODAY_ISO())
      setShowCal(false)
      setError('')
    }
  }, [open])

  const handleSave = () => {
    const n = parseInt(amount, 10)
    if (!n || n <= 0) {
      setError('請輸入金額')
      return
    }
    if (!desc.trim()) {
      setError('請輸入描述')
      return
    }
    if (payerWho === 'T' && !partner) {
      setError('伴侶尚未加入')
      return
    }
    const payerId = payerWho === 'M' ? viewer.id : partner!.id
    startTransition(async () => {
      try {
        await createTransaction({
          amount: n,
          description: desc,
          category,
          splitType: split,
          payerId,
          transactedAt: new Date(date + 'T00:00:00'),
        })
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
        className="absolute left-0 right-0 bottom-0 z-[80] flex flex-col overflow-hidden"
        style={{
          background: 'var(--bg)',
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          boxShadow: '0 -10px 40px rgba(0,0,0,0.18)',
          maxHeight: '92%',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)',
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
            新增紀錄
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
              <span
                className="tnum tracking-[-2px] leading-none min-w-[40px]"
                style={{
                  fontFamily: 'var(--font-numeric)',
                  fontSize: 56,
                  fontWeight: 600,
                  color: amount ? 'var(--ink)' : 'var(--ink-3)',
                }}
              >
                {amount ? parseInt(amount, 10).toLocaleString('en-US') : '0'}
              </span>
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

          <div className="h-6" />
        </div>

        <Numpad onKey={k => {
          if (k === 'del') setAmount(a => a.slice(0, -1))
          else if (amount.length < 7) setAmount(a => (a + k).replace(/^0+/, '') || '0')
        }} />
      </div>

      {error && (
        <div
          className="absolute top-4 left-4 right-4 z-[90] px-4 py-3 rounded-xl text-sm text-white"
          style={{ background: 'var(--debit)' }}
        >
          {error}
        </div>
      )}
    </>
  )
}
