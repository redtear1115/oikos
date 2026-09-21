'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AssetIcon } from '@/app/(dashboard)/_components/AssetIcon'
import { ConfirmModal } from '@/app/(dashboard)/_components/ConfirmModal'
import { TextInput } from '@/components/ui/TextInput'
import { useTranslations } from '@/lib/i18n/client'
import { computeNextPaymentDate, getFramingGroup, payCycleMonths } from '@/lib/insurance'
import { daysBetween, parseLocalDate } from '@/lib/local-date'
import { useToday } from '@/app/(dashboard)/_components/TodayProvider'
import { renewInsurance, lapseInsurance } from '@/actions/asset'
import { unwrapAction } from '@/lib/action-errors'
import { describeError } from '@/lib/errors'

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
  const [renewError, setRenewError] = useState('')
  const [lapseError, setLapseError] = useState('')

  const framing = getFramingGroup(data.insuranceType)
  // #1360 — from useToday(), not the clock, so SSR and hydration agree.
  const today = parseLocalDate(useToday())!
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

  const i = t.assets.insuranceList

  const handleRenew = () => {
    startTransition(async () => {
      try {
        unwrapAction(await renewInsurance({ id, newPolicyNumber: renewPolicyNo.trim() || null }))
        setRenewOpen(false)
        setRenewPolicyNo('')
        setRenewError('')
        router.refresh()
      } catch (e) {
        setRenewError(describeError(e, i.renewError, t.common.offlineError, t.errors.actions))
      }
    })
  }

  const handleLapse = () => {
    startTransition(async () => {
      try {
        unwrapAction(await lapseInsurance({ id }))
        setLapseOpen(false)
        setLapseError('')
        router.refresh()
      } catch (e) {
        setLapseError(describeError(e, i.lapseError, t.common.offlineError, t.errors.actions))
      }
    })
  }

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
        // #1324 — urgent and warning badges used to differ by colour alone
        // ("剩 {n} 天" either way). Urgent adds the expiry date itself as a
        // non-colour cue.
        label = i.daysLeftUrgent
          .replace('{n}', String(daysToExpiry))
          .replace('{date}', data.expiryDate ?? '')
      } else if (daysToExpiry <= 60) {
        tone = 'warning'
        label = i.daysLeftWarning.replace('{n}', String(daysToExpiry))
      }
    }

    const { bg, fg } = TONES[tone]
    return (
      <span
        className="shrink-0 px-1.5 py-px rounded leading-none font-mono text-xs"
        style={{ background: bg, color: fg }}
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
        className="rounded-2xl bg-surface overflow-hidden"
        style={{
          border: `1px solid color-mix(in srgb, ${stripeColor} 35%, transparent)`,
        }}
      >
        {/* Header — Link wraps only the header area (not the action row) */}
        <Link
          href={`/assets/${id}`}
          className="no-underline text-ink block"
        >
          {/* Header row */}
          <div
            className="px-4 py-3 flex items-start gap-3"
          >
            {/* Policy holder icon */}
            <div
              className="rounded-chip w-9 h-9 bg-[var(--asset-tint-insurance)] flex items-center justify-center shrink-0 overflow-hidden"
            >
              {data.policyHolderAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={data.policyHolderAvatarUrl}
                  alt=""
                  width={36}
                  height={36}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : policyHolderInitial ? (
                <span
                  className="text-base font-medium text-ink font-serif"
                >
                  {policyHolderInitial}
                </span>
              ) : (
                <AssetIcon type="insurance" size={18} />
              )}
            </div>

            {/* Name + insured */}
            <div className="flex-1 min-w-0">
              <div
                className="text-sm font-medium text-ink overflow-hidden text-ellipsis whitespace-nowrap"
              >
                {name}
              </div>
              <div
                className="text-xs mt-1 flex items-center gap-1.5 text-ink-3"
              >
                {data.insurer && (
                  <span className="text-ink-2">{data.insurer}</span>
                )}
                {insuredName && (
                  <>
                    <span
                      aria-hidden="true"
                      className="rounded-xs bg-ink-3 shrink-0 w-0.75 h-0.75"
                    />
                    <span>{i.insuredShort.replace('{name}', insuredName)}</span>
                  </>
                )}
              </div>
            </div>

            {/* Badge + annual premium */}
            <div className="text-right shrink-0">
              {renderBadge()}
              <div className="mt-1.5">
                <div
                  className="font-mono text-mini text-ink-3"
                  style={{ letterSpacing: 1 }}
                >
                  {i.annualLabel}
                </div>
                <div
                  className="tnum mt-px text-sm font-medium text-ink"
                >
                  {annualPremium > 0 ? `NT$ ${fmtNT(annualPremium)}` : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Timeline visualization */}
          <div className="px-4 pb-3.5">
            {isSingleYear && (
              <TimelineBar
                pct={singleYearPct}
                fillColor={singleYearBarColor}
                leftLabel={i.timelineStarts}
                leftValue={data.startsAt ?? '—'}
                rightLabel={i.timelineEnds}
                rightValue={data.expiryDate ?? '—'}
              />
            )}
            {isMultiYearProtection && termYears > 0 && (
              <TimelineBar
                pct={Math.min(100, Math.round((yearsPassed / termYears) * 100))}
                fillColor="var(--asset-color-insurance)"
                leftLabel={i.timelinePaid}
                leftValue={i.timelinePaidYears.replace('{paid}', String(yearsPassed)).replace('{term}', String(termYears))}
                rightLabel={i.timelineSumInsured}
                rightValue={data.sumInsured ? `NT$ ${fmtNT(data.sumInsured)}` : '—'}
              />
            )}
            {isSavings && targetAmount > 0 && (
              <TimelineBar
                pct={Math.min(100, Math.round((cumulativePaid / targetAmount) * 100))}
                fillColor="var(--saving)"
                leftLabel={i.timelineInvested}
                leftValue={`NT$ ${fmtNT(cumulativePaid)}`}
                rightLabel={i.timelineTarget}
                rightValue={`NT$ ${fmtNT(targetAmount)}`}
              />
            )}
          </div>
        </Link>

        {/* Action row for expired single-year — outside Link so buttons don't navigate */}
        {showActionRow && (
          <div className="px-4 pb-3.5 flex gap-2">
            <button
              type="button"
              onClick={() => { setRenewError(''); setRenewOpen(true) }}
              disabled={pending}
              style={{
                fontFamily: 'inherit',
              }}
              className="disabled:opacity-50 rounded-chip text-xs flex-1 h-9 bg-accent-soft text-ink border border-hairline font-medium cursor-pointer"
            >
              {i.renewAction}
            </button>
            <button
              type="button"
              onClick={() => { setLapseError(''); setLapseOpen(true) }}
              disabled={pending}
              style={{
                fontFamily: 'inherit',
              }}
              className="disabled:opacity-50 rounded-chip text-xs flex-1 h-9 bg-transparent text-ink-2 border border-hairline cursor-pointer"
            >
              {i.lapseAction}
            </button>
          </div>
        )}
      </div>

      {/* Renew confirm — #1324 was a hand-rolled always-mounted dialog (hidden
          via opacity/pointerEvents only), so its input + two buttons stayed
          in Tab/VoiceOver order on every row. Rebuilt on the shared
          ConfirmModal (portal + focus trap + Escape + restore focus), which
          only mounts its panel while `open`. */}
      <ConfirmModal
        open={renewOpen}
        title={i.renewTitle}
        description={i.renewDescription}
        confirmLabel={i.renewConfirm}
        cancelLabel={t.common.cancel}
        destructive={false}
        pending={pending}
        onCancel={() => { setRenewOpen(false); setRenewError('') }}
        onConfirm={handleRenew}
      >
        <label className="block text-xs mb-1.5 text-ink-3">
          {i.renewPolicyNoLabel}
        </label>
        <TextInput
          type="text"
          value={renewPolicyNo}
          onChange={(e) => setRenewPolicyNo(e.target.value)}
          placeholder={i.renewPolicyNoPlaceholder}
          disabled={pending}
        />
        {renewError && (
          <div className="mt-3 text-sm text-destructive" role="alert">
            {renewError}
          </div>
        )}
      </ConfirmModal>

      <ConfirmModal
        open={lapseOpen}
        title={i.lapseTitle}
        description={i.lapseDescription}
        confirmLabel={i.lapseConfirm}
        cancelLabel={t.common.cancel}
        destructive
        pending={pending}
        onCancel={() => { setLapseOpen(false); setLapseError('') }}
        onConfirm={handleLapse}
      >
        {lapseError && (
          <div className="text-sm text-destructive" role="alert">
            {lapseError}
          </div>
        )}
      </ConfirmModal>
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
      {/* #1249 — `rounded-sm` is 4px on a 6px-tall bar, so CSS corner scaling
          clamps it straight back to 3px (4+4 > 6 → all radii × 6/8). Identical
          render, one fewer off-scale literal. */}
      <div
        className="rounded-sm h-1.5 relative overflow-hidden"
        style={{
          background: 'rgba(58,36,25,0.08)',
        }}
      >
        <div
          className="rounded-sm absolute left-0 top-0 bottom-0"
          style={{
            width: `${Math.max(0, Math.min(100, pct))}%`,
            background: fillColor,
          }}
        />
      </div>
      <div
        className="mt-1.5 flex justify-between items-baseline gap-2"
      >
        <div>
          <div
            className="font-mono text-mini text-ink-3"
            style={{ letterSpacing: 1 }}
          >
            {leftLabel}
          </div>
          <div
            className="font-mono tnum mt-px text-xs text-ink-2"
          >
            {leftValue}
          </div>
        </div>
        <div className="text-right">
          <div
            className="font-mono text-mini text-ink-3"
            style={{ letterSpacing: 1 }}
          >
            {rightLabel}
          </div>
          <div
            className="font-mono tnum mt-px text-xs text-ink-2"
          >
            {rightValue}
          </div>
        </div>
      </div>
    </div>
  )
}
