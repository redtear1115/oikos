'use client'

import { useState, useEffect, useTransition } from 'react'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { SheetBackdrop } from './SheetBackdrop'
import { createTransaction } from '@/actions/transaction'
import type { CategoryId } from '@/lib/categories'
import type { SplitType } from '@/lib/balance'

interface Props {
  open: boolean
  onClose: () => void
}

const TODAY_ISO = () => new Date().toISOString().slice(0, 10)

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

          {/* Body sections come in Task 16 */}
          <div data-todo-task-16 />
        </div>

        {/* Numpad comes in Task 17 */}
        <div data-todo-task-17 />
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
