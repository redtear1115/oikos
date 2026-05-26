'use client'

import { useState, useEffect, useReducer, useRef } from 'react'
import Link from 'next/link'
import { useMember, whoToMemberRole } from '@/app/(dashboard)/_components/MemberContext'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { viewerBalance } from '@/lib/balance'
import { SettlementForm } from './SettlementForm'
import { useRealtimeEvents } from '@/app/(dashboard)/_components/RealtimeProvider'
import { DEFAULT_INCOME_PALETTE } from '@/lib/incomePalettes'
import { useTranslations } from '@/lib/i18n/client'
import { ToggleButton } from '@/app/(dashboard)/_components/ToggleButton'
import { formatAmount } from '@/lib/currency'
import { UI_PREF_COOKIE, writeBoolCookie } from '@/lib/uiPrefsCookie'
import { SegmentedToggle } from '@/components/ui/SegmentedToggle'

type BalanceFadeState = {
  displayed: number
  fading: boolean
  // Tracks the last rawBalance prop we synced to. Used for render-time prop
  // sync — see the `if (rawBalance !== syncedTo)` check below — so we don't
  // need a useEffect just to mirror the prop into state.
  syncedTo: number
}

type BalanceFadeAction =
  // Prop sync: snap the underlying value to rawBalance but preserve `fading`
  // so a realtime fadeOut in flight still animates over the new value.
  | { type: 'sync'; raw: number }
  | { type: 'fadeOut' }
  // fadeIn optionally swaps the displayed value at fade completion — used by
  // the realtime balance-change handler to delay the visual swap until the
  // opacity has dropped.
  | { type: 'fadeIn'; raw?: number }

function balanceFadeReducer(s: BalanceFadeState, a: BalanceFadeAction): BalanceFadeState {
  switch (a.type) {
    case 'sync':
      return { ...s, displayed: a.raw, syncedTo: a.raw }
    case 'fadeOut':
      return { ...s, fading: true }
    case 'fadeIn':
      return { ...s, displayed: a.raw ?? s.displayed, fading: false }
  }
}

interface Props {
  rawBalance: number  // member_a perspective (positive = b owes a)
  /** Hero collapse + balance-view prefs, read from cookies server-side so SSR
   *  renders the same initial state as the client (avoids hydration mismatch). */
  initialHeroCollapsed: boolean
  initialIncludePending: boolean
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
  // Mode toggle (owned by Dashboard L2 row, not BalanceHero):
  mode: 'expense' | 'income'
  onModeChange: (m: 'expense' | 'income') => void
  // Income hero data (pre-fetched at page level):
  incomeMonthTotal: number
  incomeMonthCount: number
  recentIncomeLabel: string | null  // e.g. "5/1 · 五月薪水" or null if no incomes
}

export function BalanceHero({
  rawBalance,
  initialHeroCollapsed,
  initialIncludePending,
  pendingBalanceDelta = 0,
  onSettleMutated,
  mode,
  onModeChange,
  incomeMonthTotal,
  incomeMonthCount,
  recentIncomeLabel,
}: Props) {
  const { viewer, partner, viewerIsA, isPast } = useMember()
  const t = useTranslations()
  // Animation state — displayed value + fade flag + synced-prop tracker — all
  // in one reducer so the realtime fadeOut/fadeIn pair and the render-time
  // prop sync stay coherent. (Previously three useStates + a prop-sync effect.)
  const [{ displayed: displayedRaw, fading, syncedTo }, dispatchFade] = useReducer(
    balanceFadeReducer,
    rawBalance,
    (initial): BalanceFadeState => ({ displayed: initial, fading: false, syncedTo: initial }),
  )
  // Render-time prop sync (replaces a useEffect that only existed to mirror
  // the prop). When a fade is in flight from realtime, we still update the
  // underlying value but preserve `fading` so the animation completes.
  if (rawBalance !== syncedTo) {
    dispatchFade({ type: 'sync', raw: rawBalance })
  }

  const [heroCollapsed, setHeroCollapsedState] = useState(initialHeroCollapsed)
  const setHeroCollapsed = (next: boolean) => {
    setHeroCollapsedState(next)
    writeBoolCookie(UI_PREF_COOKIE.heroCollapsed, next)
  }
  // Settled-only vs include-pending balance view (issue #164).
  const [includePendingView, setIncludePendingViewState] = useState(initialIncludePending)
  const setIncludePendingView = (next: boolean) => {
    setIncludePendingViewState(next)
    writeBoolCookie(UI_PREF_COOKIE.balanceIncludePending, next)
  }
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const P = DEFAULT_INCOME_PALETTE

  useEffect(() => {
    return () => {
      if (fadeTimerRef.current !== null) clearTimeout(fadeTimerRef.current)
    }
  }, [])

  useRealtimeEvents((event) => {
    if (event.kind === 'balance-change') {
      dispatchFade({ type: 'fadeOut' })
      fadeTimerRef.current = setTimeout(() => {
        dispatchFade({ type: 'fadeIn', raw: event.balance })
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
    dispatchFade({ type: 'fadeOut' })
    setIncludePendingView(!includePendingView)
    // Match the realtime balance-change fade duration for visual consistency.
    fadeTimerRef.current = setTimeout(() => dispatchFade({ type: 'fadeIn' }), 150)
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
  const balanceColor = balance > 0 ? 'var(--credit)' : balance < 0 ? 'var(--debit-quiet)' : 'var(--ink)'

  const toggleCollapsed = () => {
    const next = !heroCollapsed
    setHeroCollapsed(next)
    if (next) setSettleOpen(false)
  }

  return (
    <div className={`px-5 pt-6 ${heroCollapsed ? 'pb-3' : 'pb-5'}`}>
      {mode === 'income' ? (
        // Income: always render the card; ToggleButton stays in the header row.
        <div style={{
          background: 'var(--surface)',
          borderRadius: 'var(--radius-card)',
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
                  {incomeMonthTotal > 0 ? `+${formatAmount(incomeMonthTotal, 'twd')}` : formatAmount(0, 'twd')}
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
                {incomeMonthTotal > 0 ? `+${formatAmount(incomeMonthTotal, 'twd')}` : formatAmount(0, 'twd')}
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
                  href="/settings/recurring?tab=income"
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
                  {formatAmount(amount, 'twd')}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {canSettle && <SettleButton settleOpen={settleOpen} onToggle={() => setSettleOpen(v => !v)} ariaLabel={t.balanceHero.settleAriaLabel} label={t.balanceHero.settleLabel} />}
                <ToggleButton onClick={toggleCollapsed} ariaLabel="expand" expanded={false}>+</ToggleButton>
              </div>
            </div>
          ) : (
            // Expanded layout — amount gets its own full-width row so very large
            // values (e.g. NT$ 999,999) don't crowd the action buttons; settle
            // moves into the action row below the amount instead of sharing
            // horizontal space with it. (Issue: hero amount overflow.)
            <>
              <div className="flex items-center gap-[14px]">
                <Avatar memberRole={owedByRole} initial={showInitial} src={showAvatar} size={44} />
                <div className="flex-1 min-w-0 text-sm" style={{ color: 'var(--ink-2)' }}>
                  <span className="font-medium" style={{ color: 'var(--ink)' }}>{subjectName}</span>{' '}
                  <span>{verb}</span>
                </div>
                <ToggleButton onClick={toggleCollapsed} ariaLabel="collapse" expanded={true}>−</ToggleButton>
              </div>

              <div
                className="tnum text-center leading-[1.05] tracking-[-1.4px] transition-opacity duration-150 mt-1.5"
                style={{
                  fontFamily: 'var(--font-numeric)',
                  // clamp keeps the visual hierarchy on normal amounts while
                  // shrinking gracefully on 7-digit balances so they fit a
                  // 375px viewport without truncation.
                  fontSize: 'clamp(40px, 12vw, 56px)',
                  fontWeight: 600,
                  color: balanceColor,
                  opacity: fading ? 0 : 1,
                }}
              >
                {/* TODO(v0.17 currency): typographic split — small NT$ + large digits;
                     needs `formatAmount` digits-only mode (or symbol/digits split). */}
                <span className="text-title font-medium mr-1" style={{ color: 'var(--ink-2)' }}>NT$</span>
                {amount.toLocaleString('en-US')}
              </div>

              {(hasPending || canSettle) && (
                <div
                  className="mt-3 flex items-center gap-3"
                  style={{
                    justifyContent:
                      hasPending && canSettle ? 'space-between' : hasPending ? 'flex-start' : 'flex-end',
                  }}
                >
                  {hasPending && (
                    <BalanceViewToggle
                      includePending={includePendingView}
                      onToggle={toggleBalanceView}
                      settledLabel={t.balanceHero.modeSettledLabel}
                      pendingLabel={t.balanceHero.modeIncludePendingLabel}
                      ariaLabel={t.balanceHero.modeToggleAriaLabel}
                    />
                  )}
                  {canSettle && (
                    <SettleButton
                      settleOpen={settleOpen}
                      onToggle={() => setSettleOpen(v => !v)}
                      ariaLabel={t.balanceHero.settleAriaLabel}
                      label={t.balanceHero.settleLabel}
                    />
                  )}
                </div>
              )}
            </>
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
    <SegmentedToggle
      ariaLabel={ariaLabel}
      size="sm"
      options={[
        { id: 'settled', label: settledLabel, active: !includePending, onClick: () => { if (includePending) onToggle() } },
        { id: 'pending', label: pendingLabel, active: includePending, onClick: () => { if (!includePending) onToggle() } },
      ]}
    />
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
      // Visible chip shrunk to ~30px to match the BalanceViewToggle pill height
      // in the actions row. Hit target stays ≥44px via the ::before pseudo
      // extending 7px vertically + 4px horizontally (30 + 14 = 44; #147).
      className="relative min-h-[30px] inline-flex items-center gap-1 rounded-full cursor-pointer before:absolute before:-inset-y-[7px] before:-inset-x-1 before:content-['']"
      style={{
        padding: '0 11px',
        border: '1px solid',
        borderColor: settleOpen ? 'var(--ink)' : 'var(--hairline)',
        background: settleOpen ? 'var(--ink)' : 'transparent',
        color: settleOpen ? 'var(--on-fill)' : 'var(--ink-2)',
        fontSize: 12,
        fontWeight: 500,
        transition: 'background 150ms, color 150ms, border-color 150ms',
      }}
    >
      <span aria-hidden style={{ fontSize: 13 }}>⇄</span>
      <span>{label}</span>
    </button>
  )
}
