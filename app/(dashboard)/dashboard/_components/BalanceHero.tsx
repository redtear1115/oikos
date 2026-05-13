'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useMember, whoToMemberRole } from '@/app/(dashboard)/_components/MemberContext'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { viewerBalance } from '@/lib/balance'
import { SettlementForm } from './SettlementForm'
import { ModeTogglePlaceholder } from './ModeTogglePlaceholder'
import { useRealtimeEvents } from '@/app/(dashboard)/_components/RealtimeProvider'
import { DEFAULT_INCOME_PALETTE } from '@/lib/incomePalettes'
import { useTranslations } from '@/lib/i18n/client'
import { ToggleButton } from '@/app/(dashboard)/_components/ToggleButton'

const HERO_COLLAPSED_KEY = 'hero-collapsed'
// localStorage key for the settled / include-pending balance view toggle (#164).
const BALANCE_VIEW_KEY = 'balance-view'  // 'settled' | 'pending'

interface Props {
  rawBalance: number  // member_a perspective (positive = b owes a)
  /**
   * Delta to add to `rawBalance` for the include-pending ("after settlement")
   * view. 0 when no pending CashTransactions exist; in that case the toggle
   * is hidden because the two views are identical. Issue #164.
   */
  pendingBalanceDelta?: number
  /** Called after a successful settlement so the parent can router.refresh().
   *  Optional `info.savedAmount` carries the settlement amount so the parent
   *  can surface a success toast. */
  onSettleMutated?: (info?: { savedAmount?: number; edit?: boolean; deleted?: boolean }) => void
  // Mode toggle:
  mode: 'expense' | 'income'
  onModeChange: (m: 'expense' | 'income') => void
  // Income hero data (pre-fetched at page level):
  incomeMonthTotal: number
  incomeMonthCount: number
  recentIncomeLabel: string | null  // e.g. "5/1 · 五月薪水" or null if no incomes
  incomePendingCount?: number
  expensePendingCount?: number
}

export function BalanceHero({
  rawBalance,
  pendingBalanceDelta = 0,
  onSettleMutated,
  mode,
  onModeChange,
  incomeMonthTotal,
  incomeMonthCount,
  recentIncomeLabel,
  incomePendingCount = 0,
  expensePendingCount = 0,
}: Props) {
  const { viewer, partner, viewerIsA, isPast } = useMember()
  const t = useTranslations()
  const [displayedRaw, setDisplayedRaw] = useState(rawBalance)
  const [fading, setFading] = useState(false)
  const [heroCollapsed, setHeroCollapsed] = useState(false)
  // Settled-only vs include-pending balance view (issue #164). Persisted in
  // localStorage so the user's preference survives reloads.
  const [includePendingView, setIncludePendingView] = useState(false)
  const P = DEFAULT_INCOME_PALETTE

  useEffect(() => {
    const stored = localStorage.getItem(HERO_COLLAPSED_KEY)
    if (stored === 'true') setHeroCollapsed(true)
    const viewStored = localStorage.getItem(BALANCE_VIEW_KEY)
    if (viewStored === 'pending') setIncludePendingView(true)
  }, [])

  // Sync if parent prop changes (e.g. after our own mutation router.refresh).
  useEffect(() => { setDisplayedRaw(rawBalance) }, [rawBalance])

  useRealtimeEvents((event) => {
    if (event.kind === 'balance-change') {
      setFading(true)
      setTimeout(() => {
        setDisplayedRaw(event.balance)
        setFading(false)
      }, 150)
    }
  })

  // Toggle is meaningful only when there is at least one pending row whose
  // delta is non-zero. With no pending records, both views are identical.
  const hasPending = pendingBalanceDelta !== 0
  // `isProjectionView` = the hero is showing the "after-settle" projection
  // (settled + pending). The projection is a hypothetical — pending rows have
  // not yet flowed into the settled-only GroupBalance cache — so it must NOT
  // be treated as actionable debt (issue #208).
  const isProjectionView = includePendingView && hasPending
  const effectiveRaw = isProjectionView
    ? displayedRaw + pendingBalanceDelta
    : displayedRaw
  const balance = viewerBalance(effectiveRaw, viewerIsA)
  const [settleOpen, setSettleOpen] = useState(false)

  const toggleBalanceView = () => {
    setFading(true)
    setIncludePendingView(prev => {
      const next = !prev
      localStorage.setItem(BALANCE_VIEW_KEY, next ? 'pending' : 'settled')
      return next
    })
    // Match the realtime balance-change fade duration for visual consistency.
    setTimeout(() => setFading(false), 150)
  }

  let owedByWho: 'M' | 'T'
  let subjectName: string
  let verb: string
  if (balance > 0) {
    owedByWho = 'T'
    subjectName = partner?.displayName ?? t.common.partner
    verb = t.balanceHero.partnerOwesYou
  } else if (balance < 0) {
    owedByWho = 'M'
    subjectName = t.common.you
    verb = t.balanceHero.youOwePartner
  } else {
    owedByWho = 'M'
    subjectName = t.balanceHero.currentlyLabel
    verb = t.balanceHero.currentlyEven
  }

  const amount = Math.abs(balance)
  const showInitial = owedByWho === 'M' ? viewer.initial : (partner?.initial ?? '?')
  const showAvatar = owedByWho === 'M' ? viewer.avatarUrl : (partner?.avatarUrl ?? null)
  const owedByRole = whoToMemberRole(owedByWho, viewerIsA)
  // Hide the settle button in two cases:
  //   - Past-epoch view is read-only (server action also rejects).
  //   - "After-settle" projection view (issue #208): the displayed amount
  //     includes pending deltas that haven't flowed into GroupBalance yet.
  //     Pre-filling a settlement from the projection would create an
  //     inflated row and skew the cache. Users must toggle back to the
  //     settled-only view to settle.
  const canSettle = balance !== 0 && !isPast && !isProjectionView
  // Semantic color for the debt amount: green when partner owes you, red/orange
  // when you owe partner, neutral when even. Surfaces direction at a glance (#146).
  const balanceColor = balance > 0 ? 'var(--credit)' : balance < 0 ? 'var(--debit)' : 'var(--ink)'

  const toggleCollapsed = () => {
    setHeroCollapsed(prev => {
      const next = !prev
      localStorage.setItem(HERO_COLLAPSED_KEY, String(next))
      if (next) setSettleOpen(false)
      return next
    })
  }

  return (
    <div className={`px-5 pt-6 ${heroCollapsed ? 'pb-3' : 'pb-5'}`}>
      <ModeTogglePlaceholder
        mode={mode}
        onChange={onModeChange}
        incomePendingCount={incomePendingCount}
        expensePendingCount={expensePendingCount}
      />

      {mode === 'income' ? (
        // Income: always render the card; ToggleButton stays in the header row.
        <div style={{
          background: '#fff',
          borderRadius: 20,
          border: '1px solid var(--hairline)',
          padding: '16px 22px',
          marginBottom: heroCollapsed ? 0 : 18,
        }}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-baseline gap-1.5 flex-1 min-w-0">
              <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink-3)', letterSpacing: 1.2, flexShrink: 0 }}>
                {t.balanceHero.monthlyIncome}
              </span>
              {heroCollapsed && (
                <span
                  className="tnum truncate"
                  style={{
                    fontFamily: 'var(--font-numeric)',
                    fontSize: 'var(--fs-body)',
                    fontWeight: 600,
                    color: incomeMonthTotal > 0 ? P.ink : 'var(--ink-3)',
                    letterSpacing: '-0.6px',
                    fontFeatureSettings: '"tnum"',
                  }}
                >
                  {incomeMonthTotal > 0 ? `+NT$${incomeMonthTotal.toLocaleString('en-US')}` : 'NT$0'}
                </span>
              )}
            </div>
            <ToggleButton
              onClick={toggleCollapsed}
              ariaLabel={heroCollapsed ? 'expand' : 'collapse'}
              expanded={!heroCollapsed}
            >
              {heroCollapsed ? '+' : '−'}
            </ToggleButton>
          </div>

          {!heroCollapsed && (
            <>
              <div style={{
                fontFamily: 'var(--font-numeric)',
                fontSize: 'var(--fs-amount-md)', fontWeight: 600,
                color: incomeMonthTotal > 0 ? P.ink : 'var(--ink-3)',
                letterSpacing: -1.2, marginTop: 4,
                fontFeatureSettings: '"tnum"',
              }}>
                {incomeMonthTotal > 0 ? `+NT$${incomeMonthTotal.toLocaleString('en-US')}` : 'NT$0'}
              </div>
              <div style={{
                marginTop: 12, paddingTop: 12,
                borderTop: '1px solid var(--hairline)',
                display: 'flex', gap: 16, alignItems: 'center',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink-3)', letterSpacing: 1 }}>{t.balanceHero.countLabel}</div>
                  <div style={{
                    fontSize: 'var(--fs-body)', fontWeight: 600, color: 'var(--ink)', marginTop: 2,
                    fontFeatureSettings: '"tnum"',
                  }}>{incomeMonthCount}{t.balanceHero.countSuffix && ` ${t.balanceHero.countSuffix}`}</div>
                </div>
                <div style={{ width: 1, height: 28, background: 'var(--hairline)' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink-3)', letterSpacing: 1 }}>{t.balanceHero.recent}</div>
                  <div style={{ fontSize: 'var(--fs-label)', color: 'var(--ink-2)', marginTop: 2 }}>
                    {recentIncomeLabel ?? t.balanceHero.noRecord}
                  </div>
                </div>
              </div>
              <div style={{
                marginTop: 12, paddingTop: 12,
                borderTop: '1px solid var(--hairline)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink-3)', letterSpacing: 1 }}>{t.recurringIncome.title}</span>
                <Link
                  href="/settings/recurring-income"
                  style={{ fontSize: 'var(--fs-label)', color: 'var(--ink-2)', textDecoration: 'none' }}
                >
                  {t.balanceHero.manage}
                </Link>
              </div>
            </>
          )}
        </div>
      ) : (
        // Expense: fixed button row at top-right, balance content below.
        // The button row never moves; only content below it changes.
        <div>
          {/* Buttons — always right-side of the avatar row */}
          {heroCollapsed ? (
            <div className="flex items-center gap-2">
              <Avatar memberRole={owedByRole} initial={showInitial} src={showAvatar} size={32} />
              <div className="flex-1 min-w-0 truncate transition-opacity duration-150" style={{ opacity: fading ? 0 : 1 }}>
                <span style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 'var(--fs-body)' }}>{subjectName}</span>{' '}
                <span style={{ color: 'var(--ink-2)', fontSize: 'var(--fs-body)' }}>{verb}</span>{' '}
                <span
                  className="tnum"
                  style={{
                    fontFamily: 'var(--font-numeric)',
                    fontSize: 'var(--fs-body)',
                    fontWeight: 600,
                    color: balanceColor,
                    letterSpacing: '-0.6px',
                  }}
                >
                  NT${amount.toLocaleString('en-US')}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {canSettle && <SettleButton settleOpen={settleOpen} onToggle={() => setSettleOpen(v => !v)} ariaLabel={t.balanceHero.settleAriaLabel} label={t.balanceHero.settleLabel} />}
                <ToggleButton onClick={toggleCollapsed} ariaLabel="expand" expanded={false}>+</ToggleButton>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-[14px]">
              <Avatar memberRole={owedByRole} initial={showInitial} src={showAvatar} size={44} />
              <div className="flex-1 pt-[2px] min-w-0">
                <div className="text-sm mb-1" style={{ color: 'var(--ink-2)' }}>
                  <span className="font-semibold" style={{ color: 'var(--ink)' }}>{subjectName}</span>{' '}
                  <span>{verb}</span>
                </div>
                <div
                  className="tnum leading-[1.05] tracking-[-1.4px] transition-opacity duration-150"
                  style={{
                    fontFamily: 'var(--font-numeric)',
                    fontSize: 'var(--fs-amount-lg)',
                    fontWeight: 600,
                    color: balanceColor,
                    opacity: fading ? 0 : 1,
                  }}
                >
                  <span className="text-title font-medium mr-1" style={{ color: 'var(--ink-2)' }}>NT$</span>
                  {amount.toLocaleString('en-US')}
                </div>
                {hasPending && (
                  <BalanceViewToggle
                    includePending={includePendingView}
                    onToggle={toggleBalanceView}
                    settledLabel={t.balanceHero.modeSettledLabel}
                    pendingLabel={t.balanceHero.modeIncludePendingLabel}
                    ariaLabel={t.balanceHero.modeToggleAriaLabel}
                  />
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0 pt-[2px]">
                {canSettle && <SettleButton settleOpen={settleOpen} onToggle={() => setSettleOpen(v => !v)} ariaLabel={t.balanceHero.settleAriaLabel} label={t.balanceHero.settleLabel} />}
                <ToggleButton onClick={toggleCollapsed} ariaLabel="collapse" expanded={true}>−</ToggleButton>
              </div>
            </div>
          )}

          {settleOpen && canSettle && (
            <SettlementForm
              debtAmount={amount}
              viewerIsDebtor={balance < 0}
              onClose={() => setSettleOpen(false)}
              onMutated={(info) => onSettleMutated?.(info)}
            />
          )}
        </div>
      )}

    </div>
  )
}

/**
 * Two-pill segmented toggle for the settled / include-pending balance view
 * (issue #164). Visible only when there is at least one pending CashTransaction
 * affecting the balance — when both views would render the same number the
 * toggle is hidden by the caller.
 */
function BalanceViewToggle({
  includePending,
  onToggle,
  settledLabel,
  pendingLabel,
  ariaLabel,
}: {
  includePending: boolean
  onToggle: () => void
  settledLabel: string
  pendingLabel: string
  ariaLabel: string
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="mt-2 inline-flex rounded-full"
      style={{
        border: '1px solid var(--hairline)',
        padding: 2,
        background: 'transparent',
      }}
    >
      <SegmentPill active={!includePending} onClick={() => { if (includePending) onToggle() }}>
        {settledLabel}
      </SegmentPill>
      <SegmentPill active={includePending} onClick={() => { if (!includePending) onToggle() }}>
        {pendingLabel}
      </SegmentPill>
    </div>
  )
}

function SegmentPill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="rounded-full cursor-pointer"
      style={{
        padding: '4px 12px',
        background: active ? 'var(--ink)' : 'transparent',
        color: active ? '#fff' : 'var(--ink-2)',
        fontSize: 12,
        fontWeight: 500,
        border: 'none',
        transition: 'background 150ms, color 150ms',
      }}
    >
      {children}
    </button>
  )
}

function SettleButton({ settleOpen, onToggle, ariaLabel, label }: {
  settleOpen: boolean
  onToggle: () => void
  ariaLabel: string
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={ariaLabel}
      aria-expanded={settleOpen}
      // min-h-[44px] satisfies the 44×44 tap-target guideline (#147) while the
      // visible chip stays compact via px-3 + flex sizing.
      className="relative min-h-[44px] inline-flex items-center gap-1 rounded-full cursor-pointer before:absolute before:inset-y-0 before:-inset-x-1 before:content-['']"
      style={{
        padding: '0 12px',
        border: '1px solid',
        borderColor: settleOpen ? 'var(--ink)' : 'var(--hairline)',
        background: settleOpen ? 'var(--ink)' : 'transparent',
        color: settleOpen ? '#fff' : 'var(--ink-2)',
        fontSize: 13,
        fontWeight: 500,
        transition: 'background 150ms, color 150ms, border-color 150ms',
      }}
    >
      <span aria-hidden style={{ fontSize: 14 }}>⇄</span>
      <span>{label}</span>
    </button>
  )
}
