'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { ConfirmModal } from '@/app/(dashboard)/_components/ConfirmModal'
import { CalIcon, Chevron } from '@/app/(dashboard)/_components/sheet-icons'
import { SheetBackdrop } from '@/app/(dashboard)/dashboard/_components/SheetBackdrop'
import { MiniCalendar } from '@/app/(dashboard)/dashboard/_components/MiniCalendar'
import { localTodayISO } from '@/lib/local-date'
import { createCar, editCar, softDeleteCar } from '@/actions/asset'

export interface AssetSheetInitial {
  id: string
  name: string
  plate: string
  purchasedAt: string | null  // YYYY-MM-DD
  purchasePrice: number | null
}

interface Props {
  open: boolean
  onClose: () => void
  initial?: AssetSheetInitial
  onMutated?: (kind: 'saved' | 'deleted') => void
}

function dateLabel(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return `${y} 年 ${m} 月 ${d} 日`
}

export function AssetSheet({ open, onClose, initial, onMutated }: Props) {
  const [name, setName] = useState('')
  const [plate, setPlate] = useState('')
  const [purchasedAt, setPurchasedAt] = useState<string | null>(null)
  const [purchasePrice, setPurchasePrice] = useState('')
  const [showCal, setShowCal] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    if (initial) {
      setName(initial.name)
      setPlate(initial.plate)
      setPurchasedAt(initial.purchasedAt)
      setPurchasePrice(initial.purchasePrice ? String(initial.purchasePrice) : '')
    } else {
      setName('')
      setPlate('')
      setPurchasedAt(null)
      setPurchasePrice('')
    }
    setShowCal(false)
    setError('')
    const t = setTimeout(() => nameInputRef.current?.focus(), 350)
    return () => clearTimeout(t)
  }, [open, initial])

  const isEdit = !!initial

  const handleSave = () => {
    const trimmedName = name.trim()
    const trimmedPlate = plate.trim()
    if (!trimmedName) { setError('請輸入名稱'); return }
    if (!trimmedPlate) { setError('請輸入車牌'); return }

    const price = purchasePrice ? parseInt(purchasePrice, 10) : null
    if (purchasePrice && (!price || price <= 0)) {
      setError('購入價格式錯誤'); return
    }

    startTransition(async () => {
      try {
        if (isEdit) {
          await editCar({
            id: initial!.id,
            name: trimmedName,
            plate: trimmedPlate,
            purchasedAt,
            purchasePrice: price,
          })
        } else {
          await createCar({
            name: trimmedName,
            plate: trimmedPlate,
            purchasedAt: purchasedAt ?? undefined,
            purchasePrice: price ?? undefined,
          })
        }
        onMutated?.('saved')
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
        await softDeleteCar(initial!.id)
        onMutated?.('deleted')
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
          <button onClick={onClose} className="bg-transparent border-0 text-[15px] cursor-pointer p-1" style={{ color: 'var(--ink-2)' }}>
            取消
          </button>
          <div className="text-base font-semibold tracking-wide" style={{ color: 'var(--ink)' }}>
            {isEdit ? '編輯車輛' : '新增車輛'}
          </div>
          <button
            onClick={handleSave}
            disabled={!name || !plate || pending}
            className="bg-transparent border-0 text-[15px] font-semibold p-1 cursor-pointer disabled:cursor-default"
            style={{ color: name && plate && !pending ? 'var(--accent)' : 'var(--ink-3)' }}
          >
            {pending ? '儲存中…' : '儲存'}
          </button>
        </div>

        <div className="overflow-auto flex-1 px-5 pt-2 pb-6">
          {/* Name */}
          <Field label="名稱">
            <input
              ref={nameInputRef}
              value={name}
              onChange={e => setName(e.target.value.slice(0, 32))}
              placeholder="例：我的車"
              className="w-full bg-transparent border-0 outline-none text-base"
              style={{ color: 'var(--ink)' }}
            />
          </Field>

          {/* Plate */}
          <Field label="車牌">
            <input
              value={plate}
              onChange={e => setPlate(e.target.value.toUpperCase().slice(0, 16))}
              placeholder="例：ABC-1234"
              className="w-full bg-transparent border-0 outline-none text-base tracking-[1px]"
              style={{ color: 'var(--ink)', fontFamily: 'var(--font-numeric)' }}
            />
          </Field>

          {/* Purchased At (optional) */}
          <Field label="購入日（選填）">
            <button
              type="button"
              onClick={() => setShowCal(v => !v)}
              className="w-full flex items-center gap-3 cursor-pointer text-left bg-transparent border-0 p-0"
            >
              <CalIcon />
              <div className="flex-1">
                {purchasedAt ? (
                  <span className="text-base" style={{ color: 'var(--ink)' }}>{dateLabel(purchasedAt)}</span>
                ) : (
                  <span className="text-base" style={{ color: 'var(--ink-3)' }}>未填</span>
                )}
              </div>
              <Chevron />
            </button>
            {showCal && (
              <div className="mt-3">
                <MiniCalendar
                  value={purchasedAt ?? localTodayISO()}
                  onChange={d => { setPurchasedAt(d); setShowCal(false) }}
                />
              </div>
            )}
          </Field>

          {/* Purchase Price (optional) */}
          <Field label="購入價（選填）">
            <div className="flex items-baseline gap-1.5">
              <span className="text-base" style={{ color: purchasePrice ? 'var(--ink-2)' : 'var(--ink-3)' }}>
                NT$
              </span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={purchasePrice}
                onChange={e => {
                  const next = e.target.value.replace(/[^0-9]/g, '').slice(0, 7).replace(/^0+(\d)/, '$1')
                  setPurchasePrice(next)
                }}
                placeholder="0"
                className="tnum bg-transparent border-0 outline-none text-base"
                style={{ color: 'var(--ink)', fontFamily: 'var(--font-numeric)', width: '100%' }}
              />
            </div>
          </Field>

          {isEdit && (
            <div className="pt-4">
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
                刪除這台車
              </button>
            </div>
          )}
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
        title="刪除這台車？"
        description="關聯到這台車的紀錄會繼續保留，但會顯示為「已刪除」。"
        confirmLabel="刪除"
        pending={pending}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={performDelete}
      />
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-3.5" style={{ borderBottom: '1px solid var(--hairline)' }}>
      <div className="text-xs tracking-[0.6px] mb-2" style={{ color: 'var(--ink-3)' }}>{label}</div>
      {children}
    </div>
  )
}
