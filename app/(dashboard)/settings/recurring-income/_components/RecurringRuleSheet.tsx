'use client'

import { useEffect, useState, useTransition } from 'react'
import { SheetBackdrop } from '@/app/(dashboard)/dashboard/_components/SheetBackdrop'
import { IncomeChip } from '@/app/(dashboard)/dashboard/_components/IncomeChip'
import { ConfirmModal } from '@/app/(dashboard)/_components/ConfirmModal'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { DayPicker } from './DayPicker'
import {
  createRule,
  updateRule,
  softDeleteRule,
  pauseRule,
  resumeRule,
} from '@/actions/recurringIncome'
import { INCOME_CATEGORIES } from '@/lib/incomeCategories'
import { DEFAULT_INCOME_PALETTE } from '@/lib/incomePalettes'
import { localTodayISO } from '@/lib/local-date'
import type { RecurringRuleRow } from '@/lib/db/queries/recurringIncome'

const P = DEFAULT_INCOME_PALETTE

const INTERVALS: { v: 1 | 3 | 6 | 12; label: string }[] = [
  { v: 1, label: '每月' },
  { v: 3, label: '每季' },
  { v: 6, label: '每半年' },
  { v: 12, label: '每年' },
]

interface Props {
  open: boolean
  onClose: () => void
  onMutated: () => void
  /** undefined = create mode; set = edit mode */
  initial?: RecurringRuleRow
  recipients: { id: string; displayName: string }[]
  insuranceAssets: { id: string; name: string }[]
}

export function RecurringRuleSheet({
  open,
  onClose,
  onMutated,
  initial,
  recipients,
  insuranceAssets,
}: Props) {
  const { viewer, partner, isSolo } = useMember()
  const isEdit = !!initial

  const [amount, setAmount] = useState(0)
  const [category, setCategory] = useState('salary')
  const [recipientWho, setRecipientWho] = useState<'M' | 'T'>('M')
  const [intervalMonths, setIntervalMonths] = useState<1 | 3 | 6 | 12>(1)
  const [dayOfMonth, setDayOfMonth] = useState(new Date().getDate())
  const [startsOn, setStartsOn] = useState(localTodayISO())
  const [endsOn, setEndsOn] = useState('')
  const [source, setSource] = useState('')
  const [assetId, setAssetId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [pending, startTransition] = useTransition()

  // Reset / prefill on open
  useEffect(() => {
    if (!open) return
    if (initial) {
      setAmount(initial.amount)
      setCategory(initial.category)
      setRecipientWho(initial.recipientId === viewer.id ? 'M' : 'T')
      setIntervalMonths(initial.intervalMonths as 1 | 3 | 6 | 12)
      setDayOfMonth(initial.dayOfMonth)
      setStartsOn(initial.startsOn)
      setEndsOn(initial.endsOn ?? '')
      setSource(initial.source ?? '')
      setAssetId(initial.assetId ?? '')
    } else {
      setAmount(0)
      setCategory('salary')
      setRecipientWho('M')
      setIntervalMonths(1)
      setDayOfMonth(new Date().getDate())
      setStartsOn(localTodayISO())
      setEndsOn('')
      setSource('')
      setAssetId('')
    }
    setError(null)
    setConfirmingDelete(false)
  }, [open, initial, viewer.id])

  const recipientId = isSolo
    ? viewer.id
    : recipientWho === 'M'
      ? viewer.id
      : (partner?.id ?? viewer.id)

  const handleSave = () => {
    if (!amount || amount <= 0) { setError('請輸入金額'); return }
    setError(null)
    const payload = {
      amount,
      category,
      recipientId,
      intervalMonths,
      dayOfMonth,
      startsOn,
      endsOn: endsOn || null,
      source: source.trim() || null,
      assetId: assetId || null,
    }
    startTransition(async () => {
      try {
        if (initial?.id) await updateRule({ id: initial.id, ...payload })
        else await createRule(payload)
        onMutated()
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : '儲存失敗')
      }
    })
  }

  const handlePauseResume = () => {
    if (!initial?.id) return
    const isPaused = !!initial.pausedAt
    startTransition(async () => {
      try {
        if (isPaused) await resumeRule(initial.id)
        else await pauseRule(initial.id)
        onMutated()
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : '操作失敗')
      }
    })
  }

  const handleDelete = () => {
    if (!initial?.id) return
    setConfirmingDelete(false)
    startTransition(async () => {
      try {
        await softDeleteRule(initial.id)
        onMutated()
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : '刪除失敗')
      }
    })
  }

  const isPaused = !!initial?.pausedAt

  return (
    <>
      <SheetBackdrop open={open} onClick={onClose} />

      <div
        className="fixed left-1/2 bottom-0 z-[100] w-full max-w-md -translate-x-1/2 flex flex-col overflow-hidden"
        style={{
          background: P.sheetBg,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          boxShadow: '0 -10px 40px rgba(58,36,25,0.18)',
          maxHeight: '92dvh',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)',
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        {/* Halo */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 80,
            background: `radial-gradient(120% 80% at 50% 0%, ${P.glow} 0%, transparent 70%)`,
            opacity: 0.7,
            pointerEvents: 'none',
          }}
        />

        {/* Grabber */}
        <div className="pt-2 flex justify-center relative">
          <div className="w-9 h-[5px] rounded-full" style={{ background: 'rgba(58,36,25,0.18)' }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-3 pb-2 relative">
          <button
            type="button" onClick={onClose}
            className="bg-transparent border-0 text-body cursor-pointer p-1"
            style={{ color: 'var(--ink-2)', fontFamily: 'inherit' }}
          >
            取消
          </button>
          <div className="text-base font-semibold" style={{ color: 'var(--ink)' }}>
            {isEdit ? '編輯定期進帳' : '新增定期進帳'}
          </div>
          <button
            type="button" onClick={handleSave} disabled={!amount || pending}
            className="bg-transparent border-0 text-body font-semibold cursor-pointer p-1 disabled:cursor-default transition-colors duration-150"
            style={{ color: amount && !pending ? P.ink : 'var(--ink-3)', fontFamily: 'inherit' }}
          >
            {pending ? '儲存中…' : '儲存'}
          </button>
        </div>

        <div className="overflow-auto flex-1">
          {/* Amount */}
          <div className="text-center" style={{ padding: '24px 24px 20px' }}>
            <div
              style={{
                fontSize: 'var(--fs-micro)', color: 'var(--ink-3)',
                letterSpacing: 1.2, marginBottom: 12,
              }}
            >
              固定金額
            </div>
            <label className="flex items-baseline justify-center gap-2 cursor-text">
              <span className="text-title font-medium" style={{ color: 'var(--ink-2)' }}>NT$</span>
              <input
                type="number" min={1} inputMode="numeric"
                value={amount || ''}
                onChange={(e) => setAmount(parseInt(e.target.value || '0', 10))}
                placeholder="0"
                aria-label="固定金額"
                className="bg-transparent border-0 outline-none text-center"
                style={{
                  fontFamily: 'var(--font-numeric)',
                  fontSize: 'var(--fs-amount-lg)',
                  fontWeight: 600,
                  color: amount ? 'var(--ink)' : 'var(--ink-3)',
                  letterSpacing: -2,
                  lineHeight: 1,
                  width: `${Math.max(String(amount || 0).length, 2)}ch`,
                  caretColor: P.ink,
                }}
              />
            </label>

            {/* Recipient toggle */}
            {!isSolo && (
              <div
                className="flex items-center justify-center gap-2.5 text-label"
                style={{ marginTop: 18, color: 'var(--ink-2)' }}
              >
                <span>進到誰那？</span>
                <div
                  className="inline-flex rounded-full p-[3px] gap-0.5"
                  style={{ background: 'rgba(58,36,25,0.05)' }}
                >
                  {(['M', 'T'] as const).map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setRecipientWho(w)}
                      className="h-7 px-3.5 rounded-full border-0 text-label font-medium cursor-pointer flex items-center gap-1.5 transition-all duration-150"
                      style={{
                        background: recipientWho === w ? '#fff' : 'transparent',
                        color: recipientWho === w ? 'var(--ink)' : 'var(--ink-2)',
                        fontFamily: 'inherit',
                        boxShadow: recipientWho === w
                          ? `0 1px 3px rgba(58,36,25,0.10), 0 0 0 1px ${P.tint}`
                          : 'none',
                      }}
                    >
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
            )}
          </div>

          <div style={{ height: 1, margin: '0 20px', background: 'var(--hairline)' }} />

          {/* Category */}
          <div style={{ padding: '18px 0 16px' }}>
            <div
              style={{
                fontSize: 'var(--fs-micro)', color: 'var(--ink-3)',
                letterSpacing: 1.2, padding: '0 20px 12px',
              }}
            >
              類別
            </div>
            <div
              className="flex gap-2"
              style={{ padding: '0 20px', overflowX: 'auto', scrollbarWidth: 'none' }}
            >
              {INCOME_CATEGORIES.map((c) => (
                <IncomeChip
                  key={c.id}
                  cat={c}
                  selected={category === c.id}
                  onClick={() => setCategory(c.id)}
                />
              ))}
            </div>
          </div>

          <div style={{ height: 1, margin: '0 20px', background: 'var(--hairline)' }} />

          {/* Interval */}
          <div style={{ padding: '18px 20px 16px' }}>
            <div
              style={{
                fontSize: 'var(--fs-micro)', color: 'var(--ink-3)',
                letterSpacing: 1.2, marginBottom: 12,
              }}
            >
              週期
            </div>
            <div className="grid grid-cols-4 gap-2">
              {INTERVALS.map((i) => (
                <button
                  key={i.v}
                  type="button"
                  onClick={() => setIntervalMonths(i.v)}
                  className="rounded-full py-2 text-sm"
                  style={{
                    border: `1px solid ${intervalMonths === i.v ? 'var(--ink)' : 'var(--hairline)'}`,
                    background: intervalMonths === i.v ? 'var(--ink)' : 'transparent',
                    color: intervalMonths === i.v ? '#fff' : 'var(--ink)',
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  {i.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ height: 1, margin: '0 20px', background: 'var(--hairline)' }} />

          {/* Day of month */}
          <div style={{ padding: '18px 20px 16px' }}>
            <div
              style={{
                fontSize: 'var(--fs-micro)', color: 'var(--ink-3)',
                letterSpacing: 1.2, marginBottom: 12,
              }}
            >
              每月幾號
            </div>
            <DayPicker value={dayOfMonth} onChange={setDayOfMonth} />
            {dayOfMonth > 28 && (
              <div
                className="mt-2 text-xs"
                style={{ color: 'var(--ink-3)' }}
              >
                2 月或月份天數不足時，自動 fallback 到月底。
              </div>
            )}
          </div>

          <div style={{ height: 1, margin: '0 20px', background: 'var(--hairline)' }} />

          {/* Source name */}
          <div style={{ padding: '14px 20px' }}>
            <div
              style={{
                fontSize: 'var(--fs-micro)', color: 'var(--ink-3)',
                letterSpacing: 1.2, marginBottom: 8,
              }}
            >
              來源名稱（選填）
            </div>
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="公司名稱或薪資來源"
              className="w-full bg-transparent outline-none"
              style={{
                border: 'none',
                borderBottom: '1px solid var(--hairline)',
                padding: '4px 0 8px',
                fontSize: 'var(--fs-body)',
                color: 'var(--ink)',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Start / end dates */}
          <div style={{ padding: '14px 20px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label>
              <div
                style={{
                  fontSize: 'var(--fs-micro)', color: 'var(--ink-3)',
                  letterSpacing: 1.2, marginBottom: 8,
                }}
              >
                開始日期
              </div>
              <input
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
                className="w-full bg-transparent outline-none"
                style={{
                  border: '1px solid var(--hairline)',
                  borderRadius: 10,
                  padding: '8px 10px',
                  fontSize: 'var(--fs-sm)',
                  color: 'var(--ink)',
                  fontFamily: 'inherit',
                }}
              />
            </label>
            <label>
              <div
                style={{
                  fontSize: 'var(--fs-micro)', color: 'var(--ink-3)',
                  letterSpacing: 1.2, marginBottom: 8,
                }}
              >
                結束日期（選填）
              </div>
              <input
                type="date"
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
                className="w-full bg-transparent outline-none"
                style={{
                  border: '1px solid var(--hairline)',
                  borderRadius: 10,
                  padding: '8px 10px',
                  fontSize: 'var(--fs-sm)',
                  color: 'var(--ink)',
                  fontFamily: 'inherit',
                }}
              />
            </label>
          </div>

          {/* Insurance asset link (optional) */}
          {insuranceAssets.length > 0 && (
            <>
              <div style={{ height: 1, margin: '0 20px', background: 'var(--hairline)' }} />
              <div style={{ padding: '14px 20px 16px' }}>
                <div
                  style={{
                    fontSize: 'var(--fs-micro)', color: 'var(--ink-3)',
                    letterSpacing: 1.2, marginBottom: 8,
                  }}
                >
                  關聯保單（選填）
                </div>
                <select
                  value={assetId}
                  onChange={(e) => setAssetId(e.target.value)}
                  className="w-full bg-transparent"
                  style={{
                    border: '1px solid var(--hairline)',
                    borderRadius: 10,
                    padding: '8px 10px',
                    fontSize: 'var(--fs-sm)',
                    color: 'var(--ink)',
                    fontFamily: 'inherit',
                  }}
                >
                  <option value="">無</option>
                  {insuranceAssets.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Edit-mode actions */}
          {isEdit && (
            <>
              <div style={{ height: 1, margin: '8px 20px 0', background: 'var(--hairline)' }} />
              <div style={{ padding: '16px 20px 8px', display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={handlePauseResume}
                  disabled={pending}
                  className="flex-1 py-3 rounded-full text-sm font-medium disabled:opacity-50"
                  style={{
                    border: '1px solid var(--hairline)',
                    color: 'var(--ink-2)',
                    background: 'transparent',
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  {isPaused ? '恢復' : '暫停'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  disabled={pending}
                  className="flex-1 py-3 rounded-full text-sm font-medium disabled:opacity-50"
                  style={{
                    border: '1px solid #fca5a5',
                    color: '#dc2626',
                    background: 'transparent',
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  刪除規則
                </button>
              </div>
            </>
          )}

          <div className="h-8" />
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
        title="刪除這個定期規則？"
        description="已存在的待確認卡片也會一起清掉，此動作無法復原。"
        confirmLabel="刪除"
        pending={pending}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={handleDelete}
      />
    </>
  )
}
