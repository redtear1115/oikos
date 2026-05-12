'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { viewerBalance } from '@/lib/balance'
import { SettlementForm } from './SettlementForm'
import { ModeTogglePlaceholder } from './ModeTogglePlaceholder'
import { useRealtimeEvents } from '@/app/(dashboard)/_components/RealtimeProvider'
import { DEFAULT_INCOME_PALETTE } from '@/lib/incomePalettes'
import { useTranslations } from '@/lib/i18n/client'
import { ToggleButton } from '@/app/(dashboard)/_components/ToggleButton'

const HERO_COLLAPSED_KEY = 'hero-collapsed'

interface Props {
  rawBalance: number  // member_a perspective (positive = b owes a)
  /** Called after a successful settlement so the parent can router.refresh(). */
  onSettleMutated?: () => void
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
  onSettleMutated,
  mode,
  onModeChange,
  incomeMonthTotal,
  incomeMonthCount,
  recentIncomeLabel,
  incomePendingCount = 0,
  expensePendingCount = 0,
}: Props) {
  const { viewer, partner, viewerIsA } = useMember()
  const t = useTranslations()
  const [displayedRaw, setDisplayedRaw] = useState(rawBalance)
  const [fading, setFading] = useState(false)
  const [heroCollapsed, setHeroCollapsed] = useState(false)
  const P = DEFAULT_INCOME_PALETTE

  useEffect(() => {
    const stored = localStorage.getItem(HERO_COLLAPSED_KEY)
    if (stored === 'true') setHeroCollapsed(true)
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

  const balance = viewerBalance(displayedRaw, viewerIsA)
  const [settleOpen, setSettleOpen] = useState(false)

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
  const canSettle = balance !== 0
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
              <Avatar who={owedByWho} initial={showInitial} src={showAvatar} size={32} />
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
              <Avatar who={owedByWho} initial={showInitial} src={showAvatar} size={44} />
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
              onMutated={() => onSettleMutated?.()}
            />
          )}
        </div>
      )}

    </div>
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
