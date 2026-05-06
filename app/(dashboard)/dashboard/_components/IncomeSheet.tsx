'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useFocusAndSelectOnOpen } from '@/app/(dashboard)/_components/useFocusAndSelectOnOpen'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { DescIcon } from '@/app/(dashboard)/_components/sheet-icons'
import { ConfirmModal } from '@/app/(dashboard)/_components/ConfirmModal'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { SheetBackdrop } from './SheetBackdrop'
import { DateField } from './DateField'
import { createIncome, editIncome, softDeleteIncome, getInsuranceAssets } from '@/actions/income'
import { PICKABLE_INCOME_CATEGORIES } from '@/lib/incomeCategories'
import type { IncomeCategoryId, IncomeCategory } from '@/lib/incomeCategories'
import { DEFAULT_INCOME_PALETTE } from '@/lib/incomePalettes'
import { localTodayISO } from '@/lib/local-date'

// ─── Inline sub-components ──────────────────────────────────────────────────

function LightDot() {
  const ink = DEFAULT_INCOME_PALETTE.ink // #3F6A56
  return (
    <span
      aria-hidden="true"
      style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: ink,
        boxShadow: `0 0 8px ${ink}80, 0 0 0 3px ${ink}20`,
        display: 'inline-block',
        flexShrink: 0,
      }}
    />
  )
}

interface IncomeChipProps {
  cat: IncomeCategory
  selected: boolean
  onClick: () => void
}

function IncomeChip({ cat, selected, onClick }: IncomeChipProps) {
  const P = DEFAULT_INCOME_PALETTE
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 38,
        padding: '0 14px 0 8px',
        borderRadius: 999,
        border: selected ? `1.5px solid ${P.ink}` : '1px solid var(--hairline)',
        background: selected ? '#fff' : 'rgba(255,255,255,0.5)',
        color: 'var(--ink)',
        fontSize: 'var(--fs-body)',
        fontWeight: 500,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        cursor: 'pointer',
        flexShrink: 0,
        boxShadow: selected ? `0 0 0 4px ${P.glow}80` : 'none',
        transition: 'all 0.18s ease',
        fontFamily: 'inherit',
      }}
    >
      <span
        style={{
          width: 24,
          height: 24,
          borderRadius: 7,
          background: cat.tint,
          color: cat.ink,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 'var(--fs-label)',
          fontWeight: 500,
        }}
      >
        {cat.mono}
      </span>
      {cat.label}
    </button>
  )
}

function PolicyIcon({ color = '#3F6A56' }: { color?: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M11 2l7 3v5.5c0 4-3 7.5-7 9.5-4-2-7-5.5-7-9.5V5l7-3z" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 11l2 2 4-4" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ChevronDown() {
  return (
    <svg width="12" height="7" viewBox="0 0 12 7" fill="none" aria-hidden="true">
      <path d="M1 1l5 5 5-5" stroke="var(--ink-3)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─── Main IncomeSheet ────────────────────────────────────────────────────────

export interface IncomeSheetInitial {
  id: string
  amount: number
  category: string
  recipientId: string
  occurredAt: string   // ISO date YYYY-MM-DD
  source: string | null
  assetId: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  initial?: IncomeSheetInitial
  onMutated?: () => void
  prefilledAssetId?: string | null
}

export function IncomeSheet({ open, onClose, initial, onMutated, prefilledAssetId }: Props) {
  const { viewer, partner, isSolo } = useMember()
  const P = DEFAULT_INCOME_PALETTE

  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<IncomeCategoryId>('salary')
  const [recipientWho, setRecipientWho] = useState<'M' | 'T'>('M')
  const [date, setDate] = useState(localTodayISO())
  const [note, setNote] = useState('')
  const [assetId, setAssetId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // Policy picker state
  const [showPolicyPicker, setShowPolicyPicker] = useState(false)
  const [insuranceAssets, setInsuranceAssets] = useState<{ id: string; name: string }[]>([])

  const amountInputRef = useRef<HTMLInputElement>(null)

  // Derived: resolve the selected policy name from assetId + loaded assets
  const selectedPolicyName = assetId
    ? (insuranceAssets.find(a => a.id === assetId)?.name ?? null)
    : null

  const isEdit = !!initial
  const policyRelevant = category === 'maturity' || category === 'claim'

  // Reset / prefill on open
  useEffect(() => {
    if (!open) return
    if (initial) {
      setAmount(String(initial.amount))
      setCategory(
        (PICKABLE_INCOME_CATEGORIES.find(c => c.id === initial.category)?.id as IncomeCategoryId) ?? 'salary'
      )
      setRecipientWho(initial.recipientId === viewer.id ? 'M' : 'T')
      const dt = new Date(initial.occurredAt + 'T00:00:00')
      setDate(
        `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
      )
      setNote(initial.source ?? '')
      setAssetId(initial.assetId ?? null)
    } else {
      setAmount('')
      setCategory('salary')
      setRecipientWho('M')
      setDate(localTodayISO())
      setNote('')
      setAssetId(prefilledAssetId ?? null)
    }
    setError('')
    setConfirmingDelete(false)
    setShowPolicyPicker(false)
  }, [open, initial, viewer.id, prefilledAssetId])

  // Auto-suggest policy picker when category is maturity/claim
  useEffect(() => {
    const relevant = category === 'maturity' || category === 'claim'
    if (relevant) {
      setShowPolicyPicker(true)
      // Load insurance assets lazily
      getInsuranceAssets().then(setInsuranceAssets).catch(() => {})
    } else {
      setShowPolicyPicker(false)
      setAssetId(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category])

  // Focus + select amount input after sheet slides up
  useFocusAndSelectOnOpen(open, amountInputRef)

  const recipientId = isSolo
    ? viewer.id
    : recipientWho === 'M' ? viewer.id : partner!.id

  const handleSave = () => {
    const n = parseInt(amount, 10)
    if (!n || n <= 0) { setError('請輸入金額'); return }

    startTransition(async () => {
      try {
        if (isEdit) {
          await editIncome({
            oldId: initial!.id,
            amount: n,
            category,
            recipientId,
            occurredAt: date,
            source: note.trim() || null,
            assetId,
          })
        } else {
          await createIncome({
            amount: n,
            category,
            recipientId,
            occurredAt: date,
            source: note.trim() || null,
            assetId,
          })
        }
        onMutated?.()
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : '儲存失敗')
      }
    })
  }

  const performDelete = () => {
    if (!isEdit) return
    setConfirmingDelete(false)
    startTransition(async () => {
      try {
        await softDeleteIncome(initial!.id)
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
          background: P.sheetBg,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          boxShadow: '0 -10px 40px rgba(58,36,25,0.18)',
          maxHeight: '92dvh',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)',
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        {/* Radial halo at top edge */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 80,
            background: `radial-gradient(120% 80% at 50% 0%, ${P.glow} 0%, transparent 70%)`,
            opacity: 0.7,
            pointerEvents: 'none',
          }}
        />

        {/* Grabber */}
        <div className="pt-2 flex justify-center relative">
          <div
            className="w-9 h-[5px] rounded-full"
            style={{ background: 'rgba(58,36,25,0.18)' }}
          />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-3 pb-2 relative">
          <button
            type="button"
            onClick={onClose}
            className="bg-transparent border-0 text-body cursor-pointer p-1"
            style={{ color: 'var(--ink-2)', fontFamily: 'inherit' }}
          >
            取消
          </button>

          <div
            className="flex items-center gap-2 text-base font-semibold"
            style={{ color: 'var(--ink)' }}
          >
            <LightDot />
            記一筆進帳
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={!amount || pending}
            className="bg-transparent border-0 text-body font-semibold cursor-pointer p-1 disabled:cursor-default transition-colors duration-150"
            style={{
              color: amount && !pending ? P.ink : 'var(--ink-3)',
              fontFamily: 'inherit',
            }}
          >
            {pending ? '儲存中…' : '儲存'}
          </button>
        </div>

        <div className="overflow-auto flex-1">
          {/* Amount stage */}
          <div className="text-center" style={{ padding: '28px 24px 32px' }}>
            <div
              style={{
                fontSize: 'var(--fs-micro)',
                color: 'var(--ink-3)',
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                marginBottom: 14,
              }}
            >
              進帳金額
            </div>

            <label
              className="flex items-baseline justify-center gap-2 cursor-text"
              style={{ minHeight: 64 }}
              onClick={() => {
                amountInputRef.current?.focus()
                amountInputRef.current?.select()
              }}
            >
              <span
                className="text-title font-medium"
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
                value={amount ? parseInt(amount, 10).toLocaleString('en-US') : ''}
                onChange={e => {
                  const next = e.target.value.replace(/[^0-9]/g, '').slice(0, 7).replace(/^0+(\d)/, '$1')
                  setAmount(next)
                }}
                placeholder="0"
                aria-label="進帳金額"
                className="bg-transparent border-0 outline-none text-center"
                style={{
                  fontFamily: 'var(--font-numeric)',
                  fontSize: 'var(--fs-amount-lg)',
                  fontWeight: 600,
                  color: amount ? 'var(--ink)' : 'var(--ink-3)',
                  letterSpacing: -2,
                  lineHeight: 1,
                  fontFeatureSettings: '"tnum"',
                  width: `${Math.max((amount ? parseInt(amount, 10).toLocaleString('en-US').length : 1), 2)}ch`,
                  caretColor: P.ink,
                  textShadow: amount ? `0 0 24px ${P.glow}80` : 'none',
                  transition: 'text-shadow 0.4s ease',
                }}
              />
            </label>

            {/* Recipient picker */}
            {!isSolo && (
              <div
                className="flex items-center justify-center gap-2.5 text-label"
                style={{ marginTop: 24, color: 'var(--ink-2)' }}
              >
                <span>進到誰那？</span>
                <div
                  className="inline-flex rounded-full p-[3px] gap-0.5"
                  style={{ background: 'rgba(58,36,25,0.05)' }}
                >
                  {(['M', 'T'] as const).map(w => (
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

          {/* Divider */}
          <div
            style={{
              height: 1,
              margin: '0 24px',
              background: 'linear-gradient(90deg, transparent, var(--hairline), transparent)',
            }}
          />

          {/* Category section */}
          <div style={{ padding: '22px 0 18px' }}>
            <div
              style={{
                fontSize: 'var(--fs-micro)',
                color: 'var(--ink-3)',
                letterSpacing: 1.5,
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                padding: '0 24px 14px',
                textTransform: 'uppercase',
              }}
            >
              類別
            </div>
            <div
              className="flex gap-2"
              style={{ padding: '0 20px', overflowX: 'auto', scrollbarWidth: 'none' }}
            >
              {PICKABLE_INCOME_CATEGORIES.map(c => (
                <IncomeChip
                  key={c.id}
                  cat={c}
                  selected={category === c.id}
                  onClick={() => setCategory(c.id)}
                />
              ))}
            </div>
          </div>

          {/* Policy link section — only for maturity/claim */}
          {policyRelevant && (
            <div style={{ padding: '4px 20px 18px' }}>
              <div
                style={{
                  fontSize: 'var(--fs-micro)',
                  color: 'var(--ink-3)',
                  letterSpacing: 1.5,
                  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  padding: '8px 4px 12px',
                  textTransform: 'uppercase',
                }}
              >
                關聯保單
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowPolicyPicker(v => !v)
                  if (insuranceAssets.length === 0) {
                    getInsuranceAssets().then(setInsuranceAssets).catch(() => {})
                  }
                }}
                className="w-full flex items-center gap-3 text-left cursor-pointer"
                style={{
                  padding: '12px 14px',
                  borderRadius: 14,
                  border: `1px dashed ${P.ink}40`,
                  background: assetId ? P.tint : 'rgba(255,255,255,0.5)',
                  fontFamily: 'inherit',
                }}
              >
                <PolicyIcon color={P.ink} />
                <div className="flex-1">
                  <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                    {selectedPolicyName ?? '選擇對應保單'}
                  </div>
                  <div className="text-micro mt-0.5" style={{ color: 'var(--ink-3)' }}>
                    {category === 'maturity'
                      ? '此筆會記入該保單的「拿回」累計'
                      : '此筆會記入該保單的「理賠」紀錄'}
                  </div>
                </div>
                <ChevronDown />
              </button>

              {showPolicyPicker && (
                <div
                  className="mt-2 overflow-hidden"
                  style={{
                    background: '#fff',
                    borderRadius: 14,
                    border: '1px solid var(--hairline)',
                  }}
                >
                  {insuranceAssets.length === 0 ? (
                    <div className="px-4 py-3 text-sm" style={{ color: 'var(--ink-3)' }}>
                      尚無保單
                    </div>
                  ) : (
                    insuranceAssets.map((a, i) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          setAssetId(a.id)
                          setShowPolicyPicker(false)
                        }}
                        className="w-full flex items-center justify-between text-left cursor-pointer"
                        style={{
                          padding: '14px 16px',
                          background: 'transparent',
                          border: 'none',
                          borderBottom:
                            i < insuranceAssets.length - 1 ? '1px solid var(--hairline)' : 'none',
                          fontFamily: 'inherit',
                        }}
                      >
                        <div>
                          <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                            {a.name}
                          </div>
                          <div className="text-micro mt-0.5" style={{ color: 'var(--ink-3)' }}>
                            保險
                          </div>
                        </div>
                        <svg
                          width="7"
                          height="12"
                          viewBox="0 0 7 12"
                          fill="none"
                          aria-hidden="true"
                        >
                          <path
                            d="M1 1l5 5-5 5"
                            stroke="var(--ink-3)"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* Note row */}
          <div
            className="flex items-center gap-3.5"
            style={{
              padding: '14px 20px',
              borderTop: '1px solid var(--hairline)',
              borderBottom: '1px solid var(--hairline)',
              background: 'rgba(255,255,255,0.4)',
            }}
          >
            <DescIcon />
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="備註（可選）"
              className="flex-1 bg-transparent border-0 outline-none py-1"
              style={{ fontSize: 'var(--fs-body)', color: 'var(--ink)', fontFamily: 'inherit' }}
            />
          </div>

          {/* Date section */}
          <div style={{ padding: '14px 20px 24px' }}>
            <div
              style={{
                fontSize: 'var(--fs-micro)',
                color: 'var(--ink-3)',
                letterSpacing: 1.5,
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                padding: '4px 4px 12px',
                textTransform: 'uppercase',
              }}
            >
              日期
            </div>
            <DateField value={date} onChange={setDate} open={open} />
          </div>

          {/* Delete affordance — edit mode only */}
          {isEdit && (
            <div className="px-5 pt-2 pb-5 flex justify-center">
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                disabled={pending}
                className="text-sm cursor-pointer bg-transparent border-0"
                style={{ color: 'var(--destructive)' }}
              >
                刪除這筆進帳
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

      <ConfirmModal
        open={confirmingDelete && open}
        title="刪除這筆進帳？"
        description="這個動作無法復原，但帳本歷史會保留 30 天可由開發者還原。"
        confirmLabel="刪除"
        pending={pending}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={performDelete}
      />
    </>
  )
}
