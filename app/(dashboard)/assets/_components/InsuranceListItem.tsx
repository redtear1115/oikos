'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AssetIcon } from '@/app/(dashboard)/_components/AssetIcon'
import { ConfirmModal } from '@/app/(dashboard)/_components/ConfirmModal'
import { SheetBackdrop } from '@/app/(dashboard)/dashboard/_components/SheetBackdrop'
import { useTranslations } from '@/lib/i18n/client'
import { getFramingGroup } from '@/lib/insurance'
import { renewInsurance, lapseInsurance } from '@/actions/asset'

/**
 * v0.15.0 #127 — Insurance list card with type-specific behaviour.
 *
 * Three rendering modes, picked by getFramingGroup() + termYears:
 *   - savings:                累積投入 (years × annual premium), 繳費期滿 badge, USD note
 *   - multi-year protection:  progress bar (yearsPassed / termYears), 剩 N 年, sum insured
 *   - single-year protection: countdown badge (warning at 60d, red at reminderDaysBefore),
 *                             post-expiry 已續保 / 已停止 action buttons
 *
 * The whole card is a Link to /assets/[id] except the single-year action row,
 * which lives outside the Link so the buttons don't navigate.
 */

interface InsuranceData {
  insuranceType: string | null
  insured: string | null
  policyHolderUserId: string | null
  policyHolderDisplayName: string | null
  policyHolderAvatarUrl: string | null
  annualPremium: number | null
  sumInsured: number | null
  startsAt: string | null
  expiryDate: string | null
  termYears: number | null
  reminderDaysBefore: number
  notes: string | null
}

interface Props {
  id: string
  name: string
  data: InsuranceData
  isLast: boolean
}

function todayLocalDate(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86400000)
}

function parseDate(s: string | null): Date | null {
  if (!s) return null
  const d = new Date(`${s}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

export function InsuranceListItem({ id, name, data, isLast }: Props) {
  const t = useTranslations()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [renewOpen, setRenewOpen] = useState(false)
  const [lapseOpen, setLapseOpen] = useState(false)
  const [renewPolicyNo, setRenewPolicyNo] = useState('')

  const tint = 'var(--asset-tint-insurance)'
  const framing = getFramingGroup(data.insuranceType)
  const today = todayLocalDate()
  const startsAt = parseDate(data.startsAt)
  const expiryDate = parseDate(data.expiryDate)
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
  const isForeignSavings = isSavings && /USD/i.test(data.notes ?? '')

  const handleRenew = () => {
    startTransition(async () => {
      try {
        await renewInsurance({
          id,
          newPolicyNumber: renewPolicyNo.trim() || null,
        })
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

  // #142 — 要保人 (policy holder) avatar replaces the generic insurance icon
  // in the icon box. Falls back to first-letter initial if no avatar_url, and
  // to the original AssetIcon when no policy holder is set yet (legacy data).
  const policyHolderInitial = data.policyHolderDisplayName?.trim().charAt(0).toUpperCase() ?? null

  // Right-aligned secondary chip showing state for the kind.
  const renderBadge = () => {
    if (isSavings && expired) {
      return (
        <span
          className="shrink-0 px-1.5 py-px rounded-[4px] leading-none font-mono"
          style={{ fontSize: 11, background: 'var(--saving-soft)', color: 'var(--saving)' }}
        >
          {i.savingsMaturedBadge}
        </span>
      )
    }
    if (isSingleYear && daysToExpiry !== null) {
      if (expired) {
        return (
          <span
            className="shrink-0 px-1.5 py-px rounded-[4px] leading-none font-mono"
            style={{ fontSize: 11, background: 'var(--destructive-soft)', color: 'var(--destructive)' }}
          >
            {i.expiredBadge}
          </span>
        )
      }
      if (daysToExpiry <= data.reminderDaysBefore) {
        return (
          <span
            className="shrink-0 px-1.5 py-px rounded-[4px] leading-none font-mono"
            style={{ fontSize: 11, background: 'var(--destructive-soft)', color: 'var(--destructive)' }}
          >
            {i.daysLeftUrgent.replace('{n}', String(daysToExpiry))}
          </span>
        )
      }
      if (daysToExpiry <= 60) {
        return (
          <span
            className="shrink-0 px-1.5 py-px rounded-[4px] leading-none font-mono"
            style={{ fontSize: 11, background: 'var(--warning-soft)', color: 'var(--warning)' }}
          >
            {i.daysLeftWarning.replace('{n}', String(daysToExpiry))}
          </span>
        )
      }
    }
    return null
  }

  // Subtitle line content — varies by framing.
  const renderSubtitle = () => {
    const premiumStr = annualPremium > 0 ? i.annualPremium.replace('{amount}', annualPremium.toLocaleString('en-US')) : null

    if (isSavings) {
      const cumulativeStr = i.savingsCumulative.replace('{amount}', cumulativePaid.toLocaleString('en-US'))
      return (
        <span className="text-xs truncate" style={{ color: 'var(--ink-3)' }}>
          {premiumStr ? `${premiumStr} · ` : ''}{cumulativeStr}
          {isForeignSavings ? ` · ${i.savingsForeignNote}` : ''}
        </span>
      )
    }

    if (isMultiYearProtection) {
      const sumStr = data.sumInsured ? i.sumInsuredShort.replace('{amount}', data.sumInsured.toLocaleString('en-US')) : null
      const remainingStr = termYears > 0
        ? (expired || yearsRemaining === 0
            ? i.expired
            : i.yearsLeft.replace('{n}', String(yearsRemaining)))
        : null
      return (
        <span className="text-xs truncate" style={{ color: 'var(--ink-3)' }}>
          {[premiumStr, remainingStr, sumStr].filter(Boolean).join(' · ')}
        </span>
      )
    }

    // single-year (or unknown term)
    return (
      <span className="text-xs truncate" style={{ color: 'var(--ink-3)' }}>
        {premiumStr ?? i.singleYearLabel}
      </span>
    )
  }

  const showActionRow = isSingleYear && expired

  const card = (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        <div className="text-body font-semibold truncate">{name}</div>
        {data.insured && (
          <div className="text-xs truncate ml-auto" style={{ color: 'var(--ink-3)' }}>
            {i.insuredPrefix.replace('{name}', data.insured)}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
        {renderBadge()}
        {renderSubtitle()}
      </div>
      {isMultiYearProtection && termYears > 0 && (
        <div
          className="mt-2 h-1 rounded-full overflow-hidden"
          style={{ background: 'var(--hairline)' }}
        >
          <div
            className="h-full"
            style={{
              width: `${Math.min(100, Math.round((yearsPassed / termYears) * 100))}%`,
              background: 'var(--asset-tint-insurance)',
            }}
          />
        </div>
      )}
    </div>
  )

  return (
    <>
      <div
        style={{
          borderLeft: `3px solid ${tint}`,
          borderBottom: isLast ? 'none' : '1px solid var(--hairline)',
        }}
      >
        <Link
          href={`/assets/${id}`}
          className="flex items-start gap-3.5 px-5 py-4 no-underline"
          style={{ color: 'var(--ink)' }}
        >
          <div
            className="w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0 mt-0.5 overflow-hidden"
            style={{ background: tint, color: 'var(--ink-2)' }}
          >
            {data.policyHolderAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- next/image rejects external URLs without configured domains.
              <img
                src={data.policyHolderAvatarUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : policyHolderInitial ? (
              <span
                className="text-base font-semibold"
                style={{ color: 'var(--ink)', fontFamily: 'var(--font-serif)' }}
              >
                {policyHolderInitial}
              </span>
            ) : (
              <AssetIcon type="insurance" size={22} />
            )}
          </div>
          {card}
        </Link>
        {showActionRow && (
          <div className="flex gap-2 px-5 pb-4 -mt-1">
            <button
              type="button"
              onClick={() => setRenewOpen(true)}
              disabled={pending}
              className="flex-1 h-9 rounded-[10px] text-xs font-medium cursor-pointer disabled:opacity-50"
              style={{
                background: 'var(--accent-soft)',
                color: 'var(--ink)',
                border: '1px solid var(--hairline)',
              }}
            >
              {i.renewAction}
            </button>
            <button
              type="button"
              onClick={() => setLapseOpen(true)}
              disabled={pending}
              className="flex-1 h-9 rounded-[10px] text-xs font-medium cursor-pointer disabled:opacity-50"
              style={{
                background: 'transparent',
                color: 'var(--ink-2)',
                border: '1px solid var(--hairline)',
              }}
            >
              {i.lapseAction}
            </button>
          </div>
        )}
      </div>

      {/* Renew sheet — small inline form with optional new policy number */}
      <SheetBackdrop open={renewOpen} onClick={() => !pending && setRenewOpen(false)} />
      <div
        className="fixed left-1/2 top-1/2 z-[110] w-[calc(100%-48px)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6"
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
        <label
          className="block text-xs mb-1.5"
          style={{ color: 'var(--ink-3)' }}
        >
          {i.renewPolicyNoLabel}
        </label>
        <input
          type="text"
          value={renewPolicyNo}
          onChange={(e) => setRenewPolicyNo(e.target.value)}
          placeholder={i.renewPolicyNoPlaceholder}
          disabled={pending}
          className="w-full h-11 px-3 rounded-[10px] text-sm mb-5 disabled:opacity-50"
          style={{
            background: 'var(--surface)',
            color: 'var(--ink)',
            border: '1px solid var(--hairline)',
            outline: 'none',
          }}
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setRenewOpen(false)}
            disabled={pending}
            className="flex-1 h-11 rounded-[12px] cursor-pointer text-sm font-medium disabled:opacity-50"
            style={{
              background: 'transparent',
              color: 'var(--ink-2)',
              border: '1px solid var(--hairline)',
            }}
          >
            {t.common.cancel}
          </button>
          <button
            type="button"
            onClick={handleRenew}
            disabled={pending}
            className="flex-1 h-11 rounded-[12px] cursor-pointer text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--ink)' }}
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
