'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AssetIcon } from '@/app/(dashboard)/_components/AssetIcon'
import { ConfirmModal } from '@/app/(dashboard)/_components/ConfirmModal'
import { SheetBackdrop } from '@/app/(dashboard)/dashboard/_components/SheetBackdrop'
import { useTranslations } from '@/lib/i18n/client'
import { computeNextPaymentDate, getFramingGroup, payCycleMonths } from '@/lib/insurance'
import { daysBetween, parseLocalDate, todayLocalDate } from '@/lib/local-date'
import { renewInsurance, lapseInsurance } from '@/actions/asset'

/**
 * v0.15.0 #127 — Insurance list card with type-specific behaviour.
 * Redesigned in feat/list-card-redesign:
 *   - Standalone card (each card is its own rounded box, no container grouping)
 *   - Timeline visualization (single-year progress bar, multi-year/savings bars)
 *   - Section grouping is now done at the list level, not here
 */

interface InsuranceData {
  insuranceType: string | null
  insured: string | null
  insuredChildId: string | null
  insuredChildName: string | null
  insuredUserId: string | null
  insuredUserDisplayName: string | null
  policyHolderUserId: string | null
  policyHolderDisplayName: string | null
  policyHolderAvatarUrl: string | null
  insurer: string | null
  annualPremium: number | null
  sumInsured: number | null
  startsAt: string | null
  expiryDate: string | null
  termYears: number | null
  payCycle: string | null
  reminderDaysBefore: number
  notes: string | null
}

interface Props {
  id: string
  name: string
  data: InsuranceData
}

function fmtNT(n: number) {
  return n.toLocaleString('en-US')
}

export function InsuranceListItem({ id, name, data }: Props) {
  const t = useTranslations()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [renewOpen, setRenewOpen] = useState(false)
  const [lapseOpen, setLapseOpen] = useState(false)
  const [renewPolicyNo, setRenewPolicyNo] = useState('')

  const framing = getFramingGroup(data.insuranceType)
  const today = todayLocalDate()
  const startsAt = parseLocalDate(data.startsAt)
  const expiryDate = parseLocalDate(data.expiryDate)
  const annualPremium = data.annualPremium ?? 0
  const termYears = data.termYears ?? 0
  const isSingleYear = framing === 'protection' && termYears === 1
  const isMultiYearProtection = framing === 'protection' && termYears > 1
  const isSavings = framing === 'savings'

  const daysToExpiry = expiryDate ? daysBetween(today, expiryDate) : null
  const expired = daysToExpiry !== null && daysToExpiry < 0

  const yearsPassed = startsAt
    ? Math.max(0, Math.floor(daysBetween(startsAt, today) / 365))
    : 0
  const yearsRemaining = termYears > 0 ? Math.max(0, termYears - yearsPassed) : 0

  const cumulativePaid = isSavings ? yearsPassed * annualPremium : 0

  const nextPaymentDate = !isSingleYear
    ? computeNextPaymentDate(startsAt, data.payCycle, termYears, today)
    : null
  const daysToNextPayment = nextPaymentDate ? daysBetween(today, nextPaymentDate) : null
  const paymentThreshold = Math.min(data.reminderDaysBefore, Math.floor((payCycleMonths(data.payCycle) * 30) / 2))
  const showNextPaymentBadge =
    daysToNextPayment !== null && daysToNextPayment >= 0 && daysToNextPayment <= paymentThreshold

  const handleRenew = () => {
    startTransition(async () => {
      try {
        await renewInsurance({ id, newPolicyNumber: renewPolicyNo.trim() || null })
        setRenewOpen(false)
        setRenewPolicyNo('')
        router.refresh()
      } catch (e) {
        console.error('renewInsurance failed', e)
      }
    })
  }

  const handleLapse = () => {
    startTransition(async () => {
      try {
        await lapseInsurance({ id })
        setLapseOpen(false)
        router.refresh()
      } catch (e) {
        console.error('lapseInsurance failed', e)
      }
    })
  }

  const i = t.assets.insuranceList

  const policyHolderInitial = data.policyHolderDisplayName?.trim().charAt(0).toUpperCase() ?? null

  // Badge derivation (same logic as before)
  const renderBadge = () => {
    type Tone = 'destructive' | 'warning' | 'saving' | 'active'
    const TONES: Record<Tone, { bg: string; fg: string }> = {
      destructive: { bg: 'var(--destructive-soft)', fg: 'var(--destructive)' },
      warning:     { bg: 'var(--warning-soft)',     fg: 'var(--warning)' },
      saving:      { bg: 'var(--saving-soft)',      fg: 'var(--saving)' },
      active:      { bg: 'var(--asset-tint-insurance)', fg: 'var(--ink-2)' },
    }

    let tone: Tone = 'active'
    let label = i.activeBadge

    const multiPeriodTermComplete =
      (isSavings || isMultiYearProtection) &&
      (expired || (termYears > 0 && yearsRemaining === 0))

    if (multiPeriodTermComplete) {
      tone = 'saving'
      label = i.savingsMaturedBadge
    } else if (showNextPaymentBadge && daysToNextPayment !== null) {
      tone = 'warning'
      label = i.nextPaymentBadge.replace('{n}', String(daysToNextPayment))
    } else if (isSingleYear && daysToExpiry !== null) {
      if (expired) {
        tone = 'destructive'
        label = i.expiredBadge
      } else if (daysToExpiry <= data.reminderDaysBefore) {
        tone = 'destructive'
        label = i.daysLeftUrgent.replace('{n}', String(daysToExpiry))
      } else if (daysToExpiry <= 60) {
        tone = 'warning'
        label = i.daysLeftWarning.replace('{n}', String(daysToExpiry))
      }
    }

    const { bg, fg } = TONES[tone]
    return (
      <span
        className="shrink-0 px-1.5 py-px rounded-[4px] leading-none font-mono"
        style={{ fontSize: 11, background: bg, color: fg }}
      >
        {label}
      </span>
    )
  }

  // Stripe color: savings → saving-soft, protection → asset-color-insurance
  const stripeColor = isSavings ? 'var(--saving-soft)' : 'var(--asset-color-insurance)'

  // Single-year progress
  const singleYearPct = (() => {
    if (!isSingleYear || !startsAt || !expiryDate) return 0
    const total = daysBetween(startsAt, expiryDate)
    if (total <= 0) return 100
    const passed = daysBetween(startsAt, today)
    return Math.max(0, Math.min(100, Math.round((passed / total) * 100)))
  })()

  const singleYearBarColor = expired
    ? 'var(--destructive)'
    : daysToExpiry != null && daysToExpiry <= 60
      ? 'var(--warning)'
      : 'var(--saving)'

  // Target amount for savings = termYears * annualPremium
  const targetAmount = termYears > 0 && annualPremium > 0 ? termYears * annualPremium : 0

  const insuredName = data.insuredChildName ?? data.insuredUserDisplayName ?? data.insured

  const showActionRow = isSingleYear && expired

  return (
    <>
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: 16,
          border: '1px solid var(--hairline)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Left stripe */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: 3, background: stripeColor,
          }}
        />

        {/* Header — Link wraps only the header area (not the action row) */}
        <Link
          href={`/assets/${id}`}
          className="no-underline"
          style={{ color: 'var(--ink)', display: 'block' }}
        >
          {/* Header row */}
          <div
            style={{
              padding: '12px 16px 12px 18px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
            }}
          >
            {/* Policy holder icon */}
            <div
              style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'var(--asset-tint-insurance)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, overflow: 'hidden',
              }}
            >
              {data.policyHolderAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={data.policyHolderAvatarUrl}
                  alt=""
                  width={36}
                  height={36}
                  referrerPolicy="no-referrer"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : policyHolderInitial ? (
                <span
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: 'var(--ink)',
                    fontFamily: 'var(--font-serif)',
                  }}
                >
                  {policyHolderInitial}
                </span>
              ) : (
                <AssetIcon type="insurance" size={18} />
              )}
            </div>

            {/* Name + insured */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14, fontWeight: 600, color: 'var(--ink)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {name}
              </div>
              <div
                style={{
                  marginTop: 3,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11,
                  color: 'var(--ink-3)',
                }}
              >
                {data.insurer && (
                  <span style={{ color: 'var(--ink-2)' }}>{data.insurer}</span>
                )}
                {insuredName && (
                  <>
                    <span
                      aria-hidden="true"
                      style={{
                        width: 3, height: 3, borderRadius: 2,
                        background: 'var(--ink-3)', flexShrink: 0,
                      }}
                    />
                    <span>保 {insuredName}</span>
                  </>
                )}
              </div>
            </div>

            {/* Badge + annual premium */}
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              {renderBadge()}
              <div style={{ marginTop: 6 }}>
                <div
                  className="font-mono"
                  style={{ fontSize: 9, letterSpacing: 1, color: 'var(--ink-3)' }}
                >
                  年繳
                </div>
                <div
                  className="tnum"
                  style={{ marginTop: 1, fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}
                >
                  {annualPremium > 0 ? `NT$ ${fmtNT(annualPremium)}` : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Timeline visualization */}
          <div style={{ padding: '0 18px 14px 18px' }}>
            {isSingleYear && (
              <TimelineBar
                pct={singleYearPct}
                fillColor={singleYearBarColor}
                leftLabel="生效"
                leftValue={data.startsAt ?? '—'}
                rightLabel="到期"
                rightValue={data.expiryDate ?? '—'}
              />
            )}
            {isMultiYearProtection && termYears > 0 && (
              <TimelineBar
                pct={Math.min(100, Math.round((yearsPassed / termYears) * 100))}
                fillColor="var(--asset-color-insurance)"
                leftLabel="已繳"
                leftValue={`${yearsPassed} / ${termYears} 年`}
                rightLabel="保額"
                rightValue={data.sumInsured ? `NT$ ${fmtNT(data.sumInsured)}` : '—'}
              />
            )}
            {isSavings && targetAmount > 0 && (
              <TimelineBar
                pct={Math.min(100, Math.round((cumulativePaid / targetAmount) * 100))}
                fillColor="var(--saving)"
                leftLabel="已投入"
                leftValue={`NT$ ${fmtNT(cumulativePaid)}`}
                rightLabel="目標"
                rightValue={`NT$ ${fmtNT(targetAmount)}`}
              />
            )}
          </div>
        </Link>

        {/* Action row for expired single-year — outside Link so buttons don't navigate */}
        {showActionRow && (
          <div style={{ display: 'flex', gap: 8, padding: '0 16px 14px 18px' }}>
            <button
              type="button"
              onClick={() => setRenewOpen(true)}
              disabled={pending}
              style={{
                flex: 1, height: 36, borderRadius: 10,
                background: 'var(--accent-soft)', color: 'var(--ink)',
                border: '1px solid var(--hairline)',
                fontSize: 12, fontWeight: 600,
                fontFamily: 'inherit', cursor: 'pointer',
              }}
              className="disabled:opacity-50"
            >
              {i.renewAction}
            </button>
            <button
              type="button"
              onClick={() => setLapseOpen(true)}
              disabled={pending}
              style={{
                flex: 1, height: 36, borderRadius: 10,
                background: 'transparent', color: 'var(--ink-2)',
                border: '1px solid var(--hairline)',
                fontSize: 12,
                fontFamily: 'inherit', cursor: 'pointer',
              }}
              className="disabled:opacity-50"
            >
              {i.lapseAction}
            </button>
          </div>
        )}
      </div>

      {/* Renew sheet */}
      <SheetBackdrop open={renewOpen} onClick={() => !pending && setRenewOpen(false)} />
      <div
        className="fixed left-1/2 top-1/2 z-modal w-[calc(100%-48px)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--hairline)',
          boxShadow: '0 20px 60px rgba(31,27,22,0.18)',
          opacity: renewOpen ? 1 : 0,
          pointerEvents: renewOpen ? 'auto' : 'none',
          transition: 'opacity 200ms',
        }}
      >
        <h2
          className="text-button mb-2 leading-tight"
          style={{ fontFamily: 'var(--font-fraunces)', color: 'var(--ink)', fontWeight: 500 }}
        >
          {i.renewTitle}
        </h2>
        <p className="text-sm mb-4" style={{ color: 'var(--ink-2)' }}>
          {i.renewDescription}
        </p>
        <label className="block text-xs mb-1.5" style={{ color: 'var(--ink-3)' }}>
          {i.renewPolicyNoLabel}
        </label>
        <input
          type="text"
          value={renewPolicyNo}
          onChange={(e) => setRenewPolicyNo(e.target.value)}
          placeholder={i.renewPolicyNoPlaceholder}
          disabled={pending}
          className="w-full h-11 px-3 rounded-chip text-sm mb-5 disabled:opacity-50"
          style={{
            background: 'var(--surface)', color: 'var(--ink)',
            border: '1px solid var(--hairline)', outline: 'none',
          }}
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setRenewOpen(false)}
            disabled={pending}
            className="flex-1 h-11 rounded-xl cursor-pointer text-sm font-medium disabled:opacity-50"
            style={{ background: 'transparent', color: 'var(--ink-2)', border: '1px solid var(--hairline)' }}
          >
            {t.common.cancel}
          </button>
          <button
            type="button"
            onClick={handleRenew}
            disabled={pending}
            className="flex-1 h-11 rounded-xl cursor-pointer text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
          >
            {i.renewConfirm}
          </button>
        </div>
      </div>

      <ConfirmModal
        open={lapseOpen}
        title={i.lapseTitle}
        description={i.lapseDescription}
        confirmLabel={i.lapseConfirm}
        cancelLabel={t.common.cancel ?? '取消'}
        destructive
        pending={pending}
        onCancel={() => setLapseOpen(false)}
        onConfirm={handleLapse}
      />
    </>
  )
}

// ─── Timeline bar primitive ───────────────────────────────────────────────────

function TimelineBar({
  pct,
  fillColor,
  leftLabel,
  leftValue,
  rightLabel,
  rightValue,
}: {
  pct: number
  fillColor: string
  leftLabel: string
  leftValue: string
  rightLabel: string
  rightValue: string
}) {
  return (
    <div>
      <div
        style={{
          height: 6, borderRadius: 3,
          background: 'rgba(58,36,25,0.08)',
          position: 'relative', overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${Math.max(0, Math.min(100, pct))}%`,
            background: fillColor, borderRadius: 3,
          }}
        />
      </div>
      <div
        style={{
          marginTop: 6, display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline', gap: 8,
        }}
      >
        <div>
          <div
            className="font-mono"
            style={{ fontSize: 9, letterSpacing: 1, color: 'var(--ink-3)' }}
          >
            {leftLabel}
          </div>
          <div
            className="font-mono tnum"
            style={{ marginTop: 1, fontSize: 11, color: 'var(--ink-2)' }}
          >
            {leftValue}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div
            className="font-mono"
            style={{ fontSize: 9, letterSpacing: 1, color: 'var(--ink-3)' }}
          >
            {rightLabel}
          </div>
          <div
            className="font-mono tnum"
            style={{ marginTop: 1, fontSize: 11, color: 'var(--ink-2)' }}
          >
            {rightValue}
          </div>
        </div>
      </div>
    </div>
  )
}
