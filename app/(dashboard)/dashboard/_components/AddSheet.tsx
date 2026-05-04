'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { CalIcon, Chevron, DescIcon } from '@/app/(dashboard)/_components/sheet-icons'
import { ConfirmModal } from '@/app/(dashboard)/_components/ConfirmModal'
import { SheetBackdrop } from './SheetBackdrop'
import { AssetPickerSheet } from './AssetPickerSheet'
import { createTransaction, editTransaction, softDeleteTransaction } from '@/actions/transaction'
import { loadAsset } from '@/actions/asset'
import { PICKABLE_CATEGORIES } from '@/lib/categories'
import type { CategoryId } from '@/lib/categories'
import type { SplitType } from '@/lib/balance'
import { SplitGlyph } from './SplitGlyph'
import { MiniCalendar } from './MiniCalendar'
import { localTodayISO, ymdToUTCNoon } from '@/lib/local-date'

export interface AddSheetInitial {
  id: string
  amount: number
  description: string
  category: string
  splitType: SplitType
  payerId: string
  transactedAt: string  // ISO
  assetId?: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  initial?: AddSheetInitial
  /** Called after a successful create/edit/delete. Caller refreshes its own data. */
  onMutated?: () => void
  /** When opening in create mode from a car-detail FAB, prefill the asset link. */
  prefilledAssetId?: string | null
  /** Optional category prefill for create mode (e.g. 'transit' from car-detail FAB). */
  prefilledCategory?: CategoryId
}


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

export function AddSheet({ open, onClose, initial, onMutated, prefilledAssetId, prefilledCategory }: Props) {
  const { viewer, partner, isSolo } = useMember()
  const [amount, setAmount] = useState('')
  const [desc, setDesc] = useState('')
  const [category, setCategory] = useState<CategoryId>('food')
  const [split, setSplit] = useState<SplitType>('half')
  const [payerWho, setPayerWho] = useState<'M' | 'T'>('M')
  const [date, setDate] = useState(localTodayISO())
  const [showCal, setShowCal] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const amountInputRef = useRef<HTMLInputElement>(null)
  const [assetId, setAssetId] = useState<string | null>(null)
  const [assetInfo, setAssetInfo] = useState<{ name: string; plate: string | null; deletedAt: string | null } | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const loadedIdRef = useRef<string | null>(null)

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
      // Use LOCAL date components, not the UTC ISO prefix — otherwise a row stored at
      // local midnight (e.g. 2026-05-02 00:00 in UTC+8 = 2026-05-01T16:00:00Z) would
      // show as 2026-05-01 in the picker and silently shift one day on save.
      const dt = new Date(initial.transactedAt)
      const localYMD =
        `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
      setDate(localYMD)
      setAssetId(initial.assetId ?? null)
    } else {
      setAmount('')
      setDesc('')
      setCategory(prefilledCategory ?? 'food')
      setSplit(isSolo ? 'all_mine' : viewer.defaultSplitType)
      setPayerWho('M')
      setDate(localTodayISO())
      setAssetId(prefilledAssetId ?? null)
    }
    setShowCal(false)
    setError('')
    // Wait for slide-up to finish, then focus + select-all so users can type-to-replace
    // the prefilled amount in edit mode (typing replaces the selection rather than
    // appending to "240" → "2405").
    const t = setTimeout(() => {
      const el = amountInputRef.current
      if (!el) return
      el.focus()
      el.select()
    }, 350)
    return () => clearTimeout(t)
  }, [open, initial, viewer.id, viewer.defaultSplitType, isSolo, prefilledAssetId, prefilledCategory])

  useEffect(() => {
    if (!open) return
    if (!assetId) {
      setAssetInfo(null)
      loadedIdRef.current = null
      return
    }
    if (loadedIdRef.current === assetId) return  // already loaded this one, skip refetch
    setAssetInfo(null)  // clear stale info from a previous asset before fetching new
    let cancelled = false
    loadAsset(assetId).then((info) => {
      if (cancelled) return
      if (info) {
        setAssetInfo({ name: info.name, plate: info.plate, deletedAt: info.deletedAt })
        loadedIdRef.current = assetId
      } else {
        setAssetInfo(null)
        loadedIdRef.current = null
      }
    }).catch(() => {
      if (!cancelled) {
        setAssetInfo(null)  // don't leave stuck at "載入中…" on error
        loadedIdRef.current = null
      }
    })
    return () => { cancelled = true }
  }, [assetId, open])

  const isEdit = !!initial

  const handleSave = () => {
    const n = parseInt(amount, 10)
    if (!n || n <= 0) { setError('請輸入金額'); return }
    if (!desc.trim()) { setError('請輸入描述'); return }
    if (payerWho === 'T' && !partner) { setError('伴侶尚未加入'); return }
    const payerId = isSolo ? viewer.id : (payerWho === 'M' ? viewer.id : partner!.id)
    const splitType: SplitType = isSolo ? 'all_mine' : split
    const transactedAt = ymdToUTCNoon(date)

    startTransition(async () => {
      try {
        if (isEdit) {
          await editTransaction({
            oldId: initial!.id,
            amount: n,
            description: desc,
            category,
            splitType,
            payerId,
            transactedAt,
            assetId,
          })
        } else {
          await createTransaction({
            amount: n,
            description: desc,
            category,
            splitType,
            payerId,
            transactedAt,
            assetId,
          })
        }
        onMutated?.()
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : '發生錯誤')
      }
    })
  }

  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const performDelete = () => {
    if (!isEdit) return
    setConfirmingDelete(false)
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
            <label
              className="flex items-baseline justify-center gap-1.5 min-h-[60px] cursor-text"
              onClick={() => {
                // Focus + select on tap anywhere in the hero (NT$ label, the gap,
                // or the digits). Native click on the inner <input> would also focus
                // it, but tapping the label gives users a much wider hit target.
                const el = amountInputRef.current
                if (!el) return
                el.focus()
                el.select()
              }}
            >
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
                  // Min 2ch so empty/single-digit values still have a comfortable hit area;
                  // grow with content up to 7ch (matches the 7-digit cap).
                  width: `${Math.max(amount.length || 1, 2)}ch`,
                  caretColor: 'var(--accent)',
                }}
              />
            </label>

            {!isSolo && (
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

          {/* Asset link (visible in both solo and dual mode) */}
          <div className="px-5 pt-2 pb-[18px] mt-1" style={{ borderTop: '1px solid var(--hairline)' }}>
            <div className="text-xs tracking-[0.6px] px-1 py-3" style={{ color: 'var(--ink-3)' }}>
              關聯資產（選填）
            </div>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="w-full flex items-center gap-3 px-3.5 py-3 rounded-[14px] cursor-pointer text-left"
              style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
            >
              <div className="flex-1">
                {assetId && assetInfo ? (
                  <>
                    <div className="text-[15px] font-medium" style={{ color: 'var(--ink)' }}>
                      {assetInfo.name}
                      {assetInfo.deletedAt && (
                        <span className="ml-2 text-xs" style={{ color: 'var(--ink-3)' }}>（已刪除）</span>
                      )}
                    </div>
                    {assetInfo.plate && (
                      <div className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>{assetInfo.plate}</div>
                    )}
                  </>
                ) : assetId && !assetInfo ? (
                  <div className="text-[15px]" style={{ color: 'var(--ink-3)' }}>載入中…</div>
                ) : (
                  <div className="text-[15px]" style={{ color: 'var(--ink-3)' }}>不關聯</div>
                )}
              </div>
              <Chevron />
            </button>
          </div>

          {!isSolo && (
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
          )}

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

          {isEdit && (
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
        title="刪除這筆紀錄？"
        description="這個動作無法復原，但帳本歷史會保留 30 天可由開發者還原。"
        confirmLabel="刪除"
        pending={pending}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={performDelete}
      />

      <AssetPickerSheet
        open={pickerOpen && open}
        selectedAssetId={assetId}
        onClose={() => setPickerOpen(false)}
        onSelect={(id) => setAssetId(id)}
      />
    </>
  )
}
