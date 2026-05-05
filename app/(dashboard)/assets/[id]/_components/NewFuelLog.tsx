'use client'

import { useEffect, useState, useMemo, useTransition } from 'react'
import { SheetBackdrop } from '@/app/(dashboard)/dashboard/_components/SheetBackdrop'
import { MiniCalendar } from '@/app/(dashboard)/dashboard/_components/MiniCalendar'
import { ConfirmModal } from '@/app/(dashboard)/_components/ConfirmModal'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { createFuelLog, editFuelLog, softDeleteFuelLog } from '@/actions/fuelLog'
import { localTodayISO } from '@/lib/local-date'

interface CarLite {
  id: string
  name: string
  plate: string
  fuelType: '92' | '95' | '98' | 'diesel' | 'electric' | null
  primaryUserId: string | null
}

export interface NewFuelLogInitial {
  fuelLogId: string
  transactionId: string
  liters: string
  odometer: number
  station: string | null
  fuelType: '95' | '98' | 'diesel'
  loggedAt: string    // ISO string
  cost: number
  paidBy: string
  splitType: 'all_mine' | 'all_theirs' | 'half'
}

interface NewFuelLogProps {
  open: boolean
  onClose: () => void
  car: CarLite
  lastOdometer: number | null   // last fuel log's odo, for "上次" hint + km/L preview
  mode: 'create' | 'edit'
  initial?: NewFuelLogInitial | null
}

type PayerSelection = 'me' | 'partner' | 'shared'

function isoToLocalDate(iso: string): string {
  // Return YYYY-MM-DD in local timezone from an ISO string
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

type GasFuelType = '95' | '98' | 'diesel'

function toGasFuelType(ft: string | null | undefined): GasFuelType {
  if (ft === '98') return '98'
  if (ft === 'diesel') return 'diesel'
  return '95'   // default for electric / 92 / null
}

export function NewFuelLog({ open, onClose, car, lastOdometer, mode, initial }: NewFuelLogProps) {
  const { viewer, partner } = useMember()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showCal, setShowCal] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const initialPayer: PayerSelection = useMemo(() => {
    if (car.primaryUserId === null) return 'shared'
    if (car.primaryUserId === viewer.id) return 'me'
    if (partner && car.primaryUserId === partner.id) return 'partner'
    return 'me'
  }, [car.primaryUserId, viewer.id, partner])

  const [liters, setLiters] = useState('')
  const [odometer, setOdometer] = useState('')
  const [cost, setCost] = useState('')
  const [station, setStation] = useState('')
  const [fuelType, setFuelType] = useState<GasFuelType>(toGasFuelType(car.fuelType))
  const [payer, setPayer] = useState<PayerSelection>(initialPayer)
  const [date, setDate] = useState(() => localTodayISO())

  useEffect(() => {
    if (!open) return
    if (mode === 'edit' && initial) {
      setLiters(initial.liters)
      setOdometer(String(initial.odometer))
      setCost(String(initial.cost))
      setStation(initial.station ?? '')
      setFuelType(initial.fuelType)
      // Derive payer from splitType + paidBy
      if (initial.splitType === 'half') {
        setPayer('shared')
      } else if (initial.paidBy === viewer.id) {
        setPayer('me')
      } else {
        setPayer('partner')
      }
      setDate(isoToLocalDate(initial.loggedAt))
    } else {
      setLiters('')
      setOdometer('')
      setCost('')
      setStation('')
      setFuelType(toGasFuelType(car.fuelType))
      setPayer(initialPayer)
      setDate(localTodayISO())
    }
    setShowCal(false)
    setError(null)
    setConfirmDelete(false)
  }, [open, mode, initial, car.fuelType, initialPayer, viewer.id])

  // Live km/L preview
  const dist = lastOdometer !== null && odometer
    ? parseInt(odometer.replace(/,/g, ''), 10) - lastOdometer
    : null
  const litersNum = parseFloat(liters) || 0
  const econ = dist !== null && dist > 0 && litersNum > 0
    ? (dist / litersNum).toFixed(1)
    : '—'

  // Payer → { paidBy, splitType }
  function resolvePayment() {
    if (!partner) {
      return { paidBy: viewer.id, splitType: 'all_mine' as const }
    }
    if (payer === 'shared') return { paidBy: viewer.id, splitType: 'half' as const }
    if (payer === 'partner') return { paidBy: partner.id, splitType: 'all_mine' as const }
    return { paidBy: viewer.id, splitType: 'all_mine' as const }
  }

  const canSubmit = liters.trim() !== '' && odometer.trim() !== '' && cost.trim() !== '' && !pending

  function handleSubmit() {
    setError(null)
    const { paidBy, splitType } = resolvePayment()
    const odometerNum = parseInt(odometer.replace(/,/g, ''), 10)
    const costNum = parseInt(cost.replace(/,/g, ''), 10)

    startTransition(async () => {
      try {
        if (mode === 'edit' && initial) {
          await editFuelLog({
            id: initial.fuelLogId,
            assetId: car.id,
            liters: litersNum,
            odometer: odometerNum,
            cost: costNum,
            fuelType,
            loggedAt: date,
            station: station.trim() || null,
            paidBy,
            splitType,
          })
        } else {
          await createFuelLog({
            assetId: car.id,
            liters: litersNum,
            odometer: odometerNum,
            cost: costNum,
            fuelType,
            loggedAt: date,
            station: station.trim() || null,
            paidBy,
            splitType,
          })
        }
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })
  }

  function handleDelete() {
    if (!initial) return
    setConfirmDelete(false)
    startTransition(async () => {
      try {
        await softDeleteFuelLog(initial.fuelLogId)
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })
  }

  if (!open) return null

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
          maxHeight: '94dvh',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)',
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        {/* Grabber */}
        <div className="pt-2 flex justify-center shrink-0">
          <div className="w-9 h-[5px] rounded-full" style={{ background: 'rgba(31,27,22,0.18)' }} />
        </div>

        {/* Header */}
        <div className="px-4 pt-3 pb-2 flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-[10px] flex items-center justify-center"
            style={{ background: 'rgba(58,36,25,0.06)' }}
            aria-label="關閉"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M9 2l-5 5 5 5" stroke="var(--ink)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div className="flex-1">
            <div className="text-[20px] font-medium text-[var(--ink)]" style={{ fontFamily: 'var(--font-serif)' }}>
              {mode === 'edit' ? '編輯加油記錄' : '加油記錄'}
            </div>
            <div className="text-[11px] text-[var(--ink-3)]">{car.name} · {car.plate}</div>
          </div>
          {mode === 'edit' && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="w-8 h-8 rounded-[10px] flex items-center justify-center"
              style={{ background: 'rgba(58,36,25,0.06)' }}
              aria-label="刪除"
            >
              <span className="text-[18px] leading-none text-[var(--ink)]">⋯</span>
            </button>
          )}
        </div>

        {/* Hero — live km/L */}
        <div
          className="mx-4 mt-1 p-5 rounded-[18px] text-center shrink-0"
          style={{ background: 'linear-gradient(180deg, #F1ECE0 0%, #E8E4D8 100%)' }}
        >
          <div className="text-[10px] text-[#8A7B5A] tracking-[1.4px] font-mono uppercase">本次油耗</div>
          <div className="mt-1.5 inline-flex items-baseline gap-1.5">
            <span
              className="text-[56px] font-semibold text-[#3A2419] leading-none tabular-nums"
              style={{ letterSpacing: '-1.5px' }}
            >{econ}</span>
            <span className="text-[13px] text-[#8A7B5A] font-medium">km/L</span>
          </div>
          <div className="mt-1.5 text-[10px] text-[#8A7B5A] font-mono">
            {lastOdometer === null
              ? '第一次加油 · 之後才能算油耗'
              : dist !== null && dist > 0
              ? `${dist} km · ${liters || '0'}L`
              : '輸入里程與油量自動計算'}
          </div>
        </div>

        {/* Form */}
        <div className="overflow-auto flex-1 px-4 pt-4 pb-3 flex flex-col gap-2.5">
          <FormRow label="油量" unit="公升">
            <input
              value={liters}
              onChange={e => setLiters(e.target.value)}
              type="number"
              inputMode="decimal"
              step="0.01"
              placeholder="0.00"
              className="w-full h-11 px-3.5 rounded-xl border border-[var(--hairline)] bg-white text-[15px] outline-none"
              style={{ color: 'var(--ink)' }}
            />
          </FormRow>

          <FormRow
            label="加油里程"
            unit="km"
            hint={lastOdometer !== null ? `上次 ${lastOdometer.toLocaleString()} km` : undefined}
          >
            <input
              value={odometer}
              onChange={e => setOdometer(e.target.value)}
              type="number"
              inputMode="numeric"
              placeholder="0"
              className="w-full h-11 px-3.5 rounded-xl border border-[var(--hairline)] bg-white text-[15px] outline-none"
              style={{ color: 'var(--ink)' }}
            />
          </FormRow>

          <FormRow label="金額" unit="NT$">
            <input
              value={cost}
              onChange={e => setCost(e.target.value)}
              type="number"
              inputMode="numeric"
              placeholder="0"
              className="w-full h-11 px-3.5 rounded-xl border border-[var(--hairline)] bg-white text-[15px] outline-none"
              style={{ color: 'var(--ink)' }}
            />
          </FormRow>

          <FormRow label="加油站">
            <input
              value={station}
              onChange={e => setStation(e.target.value)}
              type="text"
              placeholder="例：中油 永和（選填）"
              className="w-full h-11 px-3.5 rounded-xl border border-[var(--hairline)] bg-white text-[15px] outline-none"
              style={{ color: 'var(--ink)' }}
            />
          </FormRow>

          <FormRow label="日期">
            <button
              type="button"
              onClick={() => setShowCal(v => !v)}
              className="w-full h-11 px-3.5 rounded-xl border border-[var(--hairline)] bg-white text-[15px] text-left flex items-center"
              style={{ color: 'var(--ink)' }}
            >
              {date || '選擇日期'}
            </button>
            {showCal && (
              <div className="mt-2">
                <MiniCalendar
                  value={date ?? localTodayISO()}
                  onChange={d => { setDate(d); setShowCal(false) }}
                />
              </div>
            )}
          </FormRow>

          {partner && (
            <FormRow label="付款人">
              <PayerToggleInline
                value={payer}
                onChange={setPayer}
                partnerLabel={partner.displayName ?? '對方'}
              />
            </FormRow>
          )}
        </div>

        {error && (
          <div className="mx-4 mb-2 text-[12px] shrink-0" style={{ color: 'var(--destructive)' }}>
            {error}
          </div>
        )}

        <div
          className="shrink-0 px-4 pt-3 pb-7 border-t"
          style={{ borderColor: 'var(--hairline)', background: 'var(--bg)' }}
        >
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full h-12 rounded-2xl font-semibold text-[15px] tracking-wide transition-opacity"
            style={{
              background: 'var(--ink)',
              color: '#fff',
              opacity: canSubmit ? 1 : 0.45,
              cursor: canSubmit ? 'pointer' : 'default',
            }}
          >
            {pending ? '儲存中…' : '記下這筆'}
          </button>
        </div>
      </div>

      <ConfirmModal
        open={confirmDelete}
        title="刪除這筆加油記錄？"
        description="刪除後無法復原，但其他花費紀錄不受影響。"
        confirmLabel="刪除"
        pending={pending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
      />
    </>
  )
}

// ── Local helpers ──────────────────────────────────────────────────────────

function FormRow({
  label, unit, hint, children,
}: {
  label: string
  unit?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-[var(--ink-2)] tracking-[0.4px]">{label}</span>
        {unit && <span className="text-[9px] text-[var(--ink-3)] tracking-wider font-mono">{unit}</span>}
      </div>
      {children}
      {hint && <span className="text-[10px] text-[var(--ink-3)] font-mono">{hint}</span>}
    </label>
  )
}

function PayerToggleInline({
  value, onChange, partnerLabel,
}: {
  value: PayerSelection
  onChange: (v: PayerSelection) => void
  partnerLabel: string
}) {
  const opts: Array<{ v: PayerSelection; label: string }> = [
    { v: 'me', label: '我' },
    { v: 'partner', label: partnerLabel },
    { v: 'shared', label: '共用' },
  ]
  return (
    <div className="flex gap-1 rounded-xl p-1" style={{ background: 'rgba(58,36,25,0.05)' }}>
      {opts.map(opt => (
        <button
          key={opt.v}
          type="button"
          onClick={() => onChange(opt.v)}
          className={`flex-1 h-9 rounded-lg text-[13px] font-medium transition-colors ${
            value === opt.v
              ? 'bg-white text-[var(--ink)] font-semibold shadow-sm'
              : 'bg-transparent text-[var(--ink-2)]'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
