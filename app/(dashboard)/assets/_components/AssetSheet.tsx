'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { ConfirmModal } from '@/app/(dashboard)/_components/ConfirmModal'
import { CalIcon, Chevron } from '@/app/(dashboard)/_components/sheet-icons'
import { SheetBackdrop } from '@/app/(dashboard)/dashboard/_components/SheetBackdrop'
import { MiniCalendar } from '@/app/(dashboard)/dashboard/_components/MiniCalendar'
import { localTodayISO, dateLabel } from '@/lib/local-date'
import { createCar, editCar, createLifeEntity, editLifeEntity, softDeleteAsset } from '@/actions/asset'
import { AssetIcon } from '@/app/(dashboard)/_components/AssetIcon'

export interface AssetSheetInitial {
  id: string
  type: 'car' | 'child' | 'pet' | 'plant' | 'house' | 'insurance'
  name: string
  // car-only fields
  plate?: string
  purchasedAt?: string | null
  purchasePrice?: number | null
}

interface Props {
  open: boolean
  onClose: () => void
  initial?: AssetSheetInitial
  onMutated?: (kind: 'saved' | 'deleted') => void
}

type PickerType = 'car' | 'child' | 'pet' | 'plant'

const TYPE_OPTIONS: { value: PickerType; label: string }[] = [
  { value: 'car',   label: '車' },
  { value: 'child', label: '孩子' },
  { value: 'pet',   label: '寵物' },
  { value: 'plant', label: '植物' },
]

export function AssetSheet({ open, onClose, initial, onMutated }: Props) {
  const isEdit = !!initial
  const [selectedType, setSelectedType] = useState<PickerType>('pet')
  const [name, setName] = useState('')
  // car-only fields
  const [plate, setPlate] = useState('')
  const [purchasedAt, setPurchasedAt] = useState<string | null>(null)
  const [purchasePrice, setPurchasePrice] = useState('')
  const [showCal, setShowCal] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    if (initial) {
      setSelectedType((initial.type as PickerType) ?? 'pet')
      setName(initial.name)
      setPlate(initial.plate ?? '')
      setPurchasedAt(initial.purchasedAt ?? null)
      setPurchasePrice(initial.purchasePrice ? String(initial.purchasePrice) : '')
    } else {
      setSelectedType('pet')
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

  const isCar = selectedType === 'car'

  const canSave = isCar
    ? name.trim() !== '' && plate.trim() !== '' && !pending
    : name.trim() !== '' && !pending

  const handleSave = () => {
    startTransition(async () => {
      try {
        if (isEdit) {
          if (isCar) {
            const price = purchasePrice ? parseInt(purchasePrice, 10) : null
            await editCar({
              id: initial!.id,
              name: name.trim(),
              plate: plate.trim(),
              purchasedAt,
              purchasePrice: price,
            })
          } else {
            await editLifeEntity({ id: initial!.id, name: name.trim() })
          }
        } else {
          if (isCar) {
            const price = purchasePrice ? parseInt(purchasePrice, 10) : null
            await createCar({
              name: name.trim(),
              plate: plate.trim(),
              purchasedAt: purchasedAt ?? undefined,
              purchasePrice: price ?? undefined,
            })
          } else {
            await createLifeEntity({ type: selectedType as 'child' | 'pet' | 'plant', name: name.trim() })
          }
        }
        onMutated?.('saved')
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : '發生錯誤')
      }
    })
  }

  const performDelete = () => {
    if (!isEdit) return
    setConfirmingDelete(false)
    startTransition(async () => {
      try {
        await softDeleteAsset(initial!.id)
        onMutated?.('deleted')
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : '發生錯誤')
      }
    })
  }

  const typeLabel = TYPE_OPTIONS.find(o => o.value === selectedType)?.label ?? '愛物'
  const title = isEdit ? `編輯${typeLabel}` : '新增愛物'

  const namePlaceholder = isCar ? '例：我的車'
    : selectedType === 'child' ? '例：小明'
    : selectedType === 'pet' ? '例：米嚕'
    : '例：陽台上的植物們'

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
            {title}
          </div>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="bg-transparent border-0 text-[15px] font-semibold p-1 cursor-pointer disabled:cursor-default"
            style={{ color: canSave ? 'var(--accent)' : 'var(--ink-3)' }}
          >
            {pending ? '儲存中…' : '儲存'}
          </button>
        </div>

        <div className="overflow-auto flex-1 px-5 pt-2 pb-6">
          {/* Type picker — only when creating */}
          {!isEdit && (
            <div className="mb-4">
              <div className="text-xs mb-2 tracking-wide" style={{ color: 'var(--ink-3)' }}>類型</div>
              <div className="grid grid-cols-4 gap-2">
                {TYPE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setSelectedType(opt.value)
                      setName('')
                      setPlate('')
                      setPurchasedAt(null)
                      setPurchasePrice('')
                    }}
                    className="flex flex-col items-center gap-1 py-3 rounded-[14px] border-0 cursor-pointer"
                    style={{
                      background: selectedType === opt.value ? 'var(--accent)' : 'var(--surface)',
                      color: selectedType === opt.value ? '#fff' : 'var(--ink-2)',
                    }}
                  >
                    <AssetIcon type={opt.value} size={20} color={selectedType === opt.value ? '#fff' : 'var(--ink-2)'} />
                    <span className="text-[11px] font-medium">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Name field */}
          <Field label="名稱">
            <input
              ref={nameInputRef}
              value={name}
              onChange={e => setName(e.target.value.slice(0, 32))}
              placeholder={namePlaceholder}
              className="w-full bg-transparent border-0 outline-none text-base"
              style={{ color: 'var(--ink)' }}
            />
          </Field>

          {/* Car-only fields */}
          {isCar && (
            <>
              <Field label="車牌">
                <input
                  value={plate}
                  onChange={e => setPlate(e.target.value.slice(0, 16))}
                  placeholder="例：ABC-1234"
                  className="w-full bg-transparent border-0 outline-none text-base"
                  style={{ color: 'var(--ink)', fontFamily: 'var(--font-numeric)' }}
                />
              </Field>

              <Field label="購入日期（選填）">
                <button
                  type="button"
                  className="flex items-center gap-2 bg-transparent border-0 cursor-pointer p-0 text-base"
                  style={{ color: purchasedAt ? 'var(--ink)' : 'var(--ink-3)' }}
                  onClick={() => setShowCal(v => !v)}
                >
                  <CalIcon size={16} />
                  {purchasedAt ? dateLabel(purchasedAt) : '選擇日期'}
                  <Chevron />
                </button>
                {showCal && (
                  <MiniCalendar
                    value={purchasedAt ?? localTodayISO()}
                    onChange={d => { setPurchasedAt(d); setShowCal(false) }}
                  />
                )}
              </Field>

              <Field label="購入價格（選填）">
                <div className="flex items-center gap-1">
                  <span className="text-sm" style={{ color: 'var(--ink-3)' }}>NT$</span>
                  <input
                    value={purchasePrice}
                    onChange={e => setPurchasePrice(e.target.value.replace(/\D/g, '').slice(0, 9))}
                    placeholder="0"
                    inputMode="numeric"
                    className="flex-1 bg-transparent border-0 outline-none text-base tnum"
                    style={{ color: 'var(--ink)' }}
                  />
                </div>
              </Field>
            </>
          )}

          {error && (
            <div className="mt-3 text-sm" style={{ color: 'var(--error, #c0392b)' }}>
              {error}
            </div>
          )}

          {isEdit && (
            <button
              type="button"
              className="mt-6 w-full py-3 rounded-[14px] text-sm font-medium cursor-pointer border-0"
              style={{ background: 'var(--surface)', color: 'var(--destructive)' }}
              onClick={() => setConfirmingDelete(true)}
            >
              刪除
            </button>
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirmingDelete}
        title="確認刪除？"
        description="這個愛物與所有關聯花費將從列表中移除。"
        confirmLabel="刪除"
        pending={pending}
        onConfirm={performDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="py-3"
      style={{ borderBottom: '1px solid var(--hairline)' }}
    >
      <div className="text-xs mb-1 tracking-wide" style={{ color: 'var(--ink-3)' }}>{label}</div>
      {children}
    </div>
  )
}
