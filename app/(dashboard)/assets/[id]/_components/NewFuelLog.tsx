'use client'

import { useEffect, useState, useMemo, useTransition } from 'react'
import { SheetFrame } from '@/app/(dashboard)/_components/SheetFrame'
import { MiniCalendar } from '@/app/(dashboard)/dashboard/_components/MiniCalendar'
import { PayerToggle } from '@/app/(dashboard)/dashboard/_components/PayerToggle'
import { SplitTypeSelector } from '@/app/(dashboard)/dashboard/_components/SplitTypeSelector'
import { ConfirmModal } from '@/app/(dashboard)/_components/ConfirmModal'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { createFuelLog, editFuelLog, softDeleteFuelLog } from '@/actions/fuelLog'
import { localTodayISO } from '@/lib/local-date'
import { useLocale, useTranslations } from '@/lib/i18n/client'
import { formatDateAbsolute } from '@/lib/format-date'
import { describeError } from '@/lib/errors'
import type { SplitType } from '@/lib/balance'
import type { FuelType, GasFuelType } from '@/lib/fuel'

interface CarLite {
  id: string
  name: string
  plate: string
  fuelType: FuelType | null
  primaryUserId: string | null
}

export interface NewFuelLogInitial {
  fuelLogId: string
  transactionId: string
  liters: string
  odometer: number
  station: string | null
  fuelType: GasFuelType
  loggedAt: string    // ISO string
  cost: number
  paidBy: string
  splitType: SplitType
}

interface NewFuelLogProps {
  open: boolean
  onClose: () => void
  car: CarLite
  lastOdometer: number | null   // last fuel log's odo, for "上次" hint + km/L preview
  mode: 'create' | 'edit'
  initial?: NewFuelLogInitial | null
}

function isoToLocalDate(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function toGasFuelType(ft: string | null | undefined): GasFuelType {
  if (ft === '92') return '92'
  if (ft === '98') return '98'
  if (ft === 'diesel') return 'diesel'
  return '95'   // default for electric / null
}

export function NewFuelLog({ open, onClose, car, lastOdometer, mode, initial }: NewFuelLogProps) {
  const { viewer, partner, isPast } = useMember()
  const t = useTranslations()
  const locale = useLocale()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showCal, setShowCal] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Default payer/split derived from car's primary user
  const defaultPayerWho = useMemo<'M' | 'T'>(() => {
    if (partner && car.primaryUserId === partner.id) return 'T'
    return 'M'
  }, [car.primaryUserId, partner])

  const defaultSplit = useMemo<'all_mine' | 'all_theirs' | 'half'>(() => {
    if (!partner) return 'all_mine'
    if (car.primaryUserId === null) return 'half'
    return 'all_mine'
  }, [car.primaryUserId, partner])

  const [liters, setLiters] = useState('')
  const [odometer, setOdometer] = useState('')
  const [cost, setCost] = useState('')
  const [fuelType, setFuelType] = useState<GasFuelType>(toGasFuelType(car.fuelType))
  const [payerWho, setPayerWho] = useState<'M' | 'T'>(defaultPayerWho)
  const [split, setSplit] = useState<'all_mine' | 'all_theirs' | 'half'>(defaultSplit)
  const [date, setDate] = useState(() => localTodayISO())

  useEffect(() => {
    if (!open) return
    if (mode === 'edit' && initial) {
      setLiters(initial.liters)
      setOdometer(String(initial.odometer))
      setCost(String(initial.cost))
      setFuelType(initial.fuelType)
      setPayerWho(initial.paidBy === viewer.id ? 'M' : 'T')
      setSplit(initial.splitType as 'all_mine' | 'all_theirs' | 'half')
      setDate(isoToLocalDate(initial.loggedAt))
    } else {
      setLiters('')
      setOdometer('')
      setCost('')
      setFuelType(toGasFuelType(car.fuelType))
      setPayerWho(defaultPayerWho)
      setSplit(defaultSplit)
      setDate(localTodayISO())
    }
    setShowCal(false)
    setError(null)
    setConfirmDelete(false)
  }, [open, mode, initial, car.fuelType, defaultPayerWho, defaultSplit, viewer.id])

  // Live km/L preview
  const dist = lastOdometer !== null && odometer
    ? parseInt(odometer.replace(/,/g, ''), 10) - lastOdometer
    : null
  const litersNum = parseFloat(liters) || 0
  const econ = dist !== null && dist > 0 && litersNum > 0
    ? (dist / litersNum).toFixed(1)
    : '—'

  const costNum = parseInt(cost.replace(/,/g, ''), 10) || 0

  function resolvePayment() {
    const paidBy = payerWho === 'M' ? viewer.id : (partner?.id ?? viewer.id)
    const splitType: SplitType = partner ? split : 'all_mine'
    return { paidBy, splitType }
  }

  const canSubmit = liters.trim() !== '' && odometer.trim() !== '' && cost.trim() !== '' && !pending

  function handleSubmit() {
    setError(null)
    const { paidBy, splitType } = resolvePayment()
    const odometerNum = parseInt(odometer.replace(/,/g, ''), 10)

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
            station: initial.station,
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
            station: null,
            paidBy,
            splitType,
          })
        }
        onClose()
      } catch (err) {
        setError(describeError(err, t.common.error, t.common.offlineError))
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
        setError(describeError(err, t.common.error, t.common.offlineError))
      }
    })
  }

  if (!open) return null

  return (
    <>
      <SheetFrame
        open={open}
        onClose={onClose}
        ariaLabel={mode === 'edit' ? '編輯加油記錄' : '加油記錄'}
        topRadius={28}
        heightDvh={94}
      >
        {/* Header */}
        <div className="px-4 pt-3 pb-2 flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-chip flex items-center justify-center"
            style={{ background: 'rgba(58,36,25,0.06)' }}
            aria-label="關閉"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M9 2l-5 5 5 5" stroke="var(--ink)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div className="flex-1">
            <div className="text-title font-medium text-[var(--ink)]" style={{ fontFamily: 'var(--font-serif)' }}>
              {mode === 'edit' ? '編輯加油記錄' : '加油記錄'}
            </div>
            <div className="text-micro text-[var(--ink-3)]">{car.name} · {car.plate}</div>
          </div>
          {/* Past-epoch view is read-only — hide delete affordance. */}
          {mode === 'edit' && !isPast && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="w-8 h-8 rounded-chip flex items-center justify-center"
              style={{ background: 'rgba(58,36,25,0.06)' }}
              aria-label="刪除"
            >
              <span className="text-button leading-none text-[var(--ink)]">⋯</span>
            </button>
          )}
        </div>

        {/* Hero — live km/L */}
        <div
          className="mx-4 mt-1 p-5 rounded-tile text-center shrink-0"
          style={{ background: 'linear-gradient(180deg, #F1ECE0 0%, #E8E4D8 100%)' }}
        >
          <div className="text-micro text-[#8A7B5A] tracking-[1.4px] font-mono uppercase">本次油耗</div>
          <div className="mt-1.5 inline-flex items-baseline gap-1.5">
            <span
              className="text-amount-lg font-medium text-[#3A2419] leading-none tabular-nums"
              style={{ letterSpacing: '-1.5px' }}
            >{econ}</span>
            <span className="text-label text-[#8A7B5A] font-medium">km/L</span>
          </div>
          <div className="mt-1.5 text-micro text-[#8A7B5A] font-mono">
            {lastOdometer === null
              ? '第一次加油 · 之後才能算油耗'
              : dist !== null && dist > 0
              ? `${dist} km · ${liters || '0'}L`
              : '輸入里程與油量自動計算'}
          </div>
        </div>

        {/* 誰付的 toggle — only when there's a partner */}
        {partner && (
          <PayerToggle value={payerWho} onChange={setPayerWho} />
        )}

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
              className="w-full h-11 px-3.5 rounded-xl border border-[var(--hairline)] bg-surface text-body outline-none"
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
              className="w-full h-11 px-3.5 rounded-xl border border-[var(--hairline)] bg-surface text-body outline-none"
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
              className="w-full h-11 px-3.5 rounded-xl border border-[var(--hairline)] bg-surface text-body outline-none"
              style={{ color: 'var(--ink)' }}
            />
          </FormRow>

          <FormRow label="日期">
            <button
              type="button"
              onClick={() => setShowCal(v => !v)}
              className="w-full h-11 px-3.5 rounded-xl border border-[var(--hairline)] bg-surface text-body text-left flex items-center"
              style={{ color: 'var(--ink)' }}
            >
              {date ? formatDateAbsolute(date, locale) : '選擇日期'}
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

          {/* 分攤方式 — only when there's a partner */}
          {partner && (
            <div className="flex flex-col gap-1.5">
              <span className="text-micro text-[var(--ink-2)] tracking-[0.4px]">分攤方式</span>
              <SplitTypeSelector
                value={split}
                onChange={(s) => { if (s !== 'weighted') setSplit(s) }}
                amount={costNum}
                payerWho={payerWho}
                splitRatioA={50}
                onSplitRatioAChange={() => {}}
              />
            </div>
          )}
        </div>

        {error && (
          <div className="mx-4 mb-2 text-label shrink-0" style={{ color: 'var(--destructive)' }}>
            {error}
          </div>
        )}

        {/* Past-epoch view is read-only — hide the submit footer entirely so
            the sheet reads as plain detail. The sheet itself shouldn't open
            in past view (parent gates onItemClick + FAB), but keep this guard
            for defence in depth. */}
        {!isPast && (
          <div
            className="shrink-0 px-4 pt-3 pb-7 border-t"
            style={{ borderColor: 'var(--hairline)', background: 'var(--bg)' }}
          >
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="w-full h-12 rounded-2xl font-medium text-body tracking-wide transition-opacity"
              style={{
                background: 'var(--btn-primary-bg)',
                color: 'var(--btn-primary-text)',
                opacity: canSubmit ? 1 : 0.45,
                cursor: canSubmit ? 'pointer' : 'default',
              }}
            >
              {pending ? '儲存中…' : mode === 'edit' ? t.common.update : '記下這筆'}
            </button>
          </div>
        )}
      </SheetFrame>

      <ConfirmModal
        open={confirmDelete}
        title="刪除這筆加油記錄？"
        description="刪除後無法復原，但其他支出紀錄不受影響。"
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
        <span className="text-micro text-[var(--ink-2)] tracking-[0.4px]">{label}</span>
        {unit && <span className="text-micro text-[var(--ink-3)] tracking-wider font-mono">{unit}</span>}
      </div>
      {children}
      {hint && <span className="text-micro text-[var(--ink-3)] font-mono">{hint}</span>}
    </label>
  )
}
