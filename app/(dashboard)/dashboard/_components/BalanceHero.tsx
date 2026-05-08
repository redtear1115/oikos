'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { PlusIcon } from '@/app/(dashboard)/_components/PlusIcon'
import { viewerBalance } from '@/lib/balance'
import { SettlementForm } from './SettlementForm'
import { ModeTogglePlaceholder } from './ModeTogglePlaceholder'
import { useRealtimeEvents } from '@/app/(dashboard)/_components/RealtimeProvider'
import { DEFAULT_INCOME_PALETTE } from '@/lib/incomePalettes'
import { useTranslations } from '@/lib/i18n/client'

interface Props {
  rawBalance: number  // member_a perspective (positive = b owes a)
  onAddClick: () => void
  /** Called after a successful settlement so the parent can router.refresh(). */
  onSettleMutated?: () => void
  // Mode toggle:
  mode: 'expense' | 'income'
  onModeChange: (m: 'expense' | 'income') => void
  // Income hero data (pre-fetched at page level):
  incomeMonthTotal: number
  incomeMonthCount: number
  recentIncomeLabel: string | null  // e.g. "5/1 · 五月薪水" or null if no incomes
  pendingCount?: number
}

export function BalanceHero({
  rawBalance,
  onAddClick,
  onSettleMutated,
  mode,
  onModeChange,
  incomeMonthTotal,
  incomeMonthCount,
  recentIncomeLabel,
  pendingCount = 0,
}: Props) {
  const { viewer, partner, viewerIsA } = useMember()
  const t = useTranslations()
  const [displayedRaw, setDisplayedRaw] = useState(rawBalance)
  const [fading, setFading] = useState(false)
  const P = DEFAULT_INCOME_PALETTE

  // Sync if parent prop changes (e.g. after our own mutation router.refresh).
  useEffect(() => { setDisplayedRaw(rawBalance) }, [rawBalance])

  useRealtimeEvents((event) => {
    if (event.kind === 'balance-change') {
      // The realtime payload is in member_a's perspective (raw). Cross-fade.
      setFading(true)
      setTimeout(() => {
        setDisplayedRaw(event.balance)
        setFading(false)
      }, 150)
    }
    // Other event kinds are handled by TransactionFeed; no-op here.
  })

  const balance = viewerBalance(displayedRaw, viewerIsA)
  const [settleOpen, setSettleOpen] = useState(false)

  // balance > 0 → partner owes you; balance < 0 → you owe partner; balance == 0 → even
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

  return (
    <div className="px-5 pt-6 pb-5">
      <ModeTogglePlaceholder mode={mode} onChange={onModeChange} pendingCount={pendingCount} />

      {mode === 'income' ? (
        // Income hero card
        <div style={{
          background: '#fff',
          borderRadius: 20,
          border: '1px solid var(--hairline)',
          padding: '20px 22px',
          marginBottom: 18,
        }}>
          <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink-3)', letterSpacing: 1.2 }}>
            {t.balanceHero.monthlyIncome}
          </div>
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
        </div>
      ) : (
        // Expense: balance display + settle button
        <>
          <button
            type="button"
            onClick={() => canSettle && setSettleOpen((v) => !v)}
            disabled={!canSettle}
            className="w-full text-left bg-transparent border-0 cursor-pointer disabled:cursor-default p-0"
            aria-expanded={settleOpen}
            aria-label={canSettle ? t.balanceHero.settleAriaLabel : undefined}
          >
            <div className="flex items-start gap-[14px]">
              <Avatar who={owedByWho} initial={showInitial} src={showAvatar} size={44} />
              <div className="flex-1 pt-[2px] min-w-0">
                <div className="text-sm mb-1" style={{ color: 'var(--ink-2)' }}>
                  <span className="font-semibold" style={{ color: 'var(--ink)' }}>{subjectName}</span>{' '}
                  <span>{verb}</span>
                </div>
                <div className="tnum leading-[1.05] tracking-[-1.4px] transition-opacity duration-150"
                  style={{
                    fontFamily: 'var(--font-numeric)',
                    fontSize: 'var(--fs-amount-lg)',
                    fontWeight: 600,
                    color: 'var(--ink)',
                    opacity: fading ? 0 : 1,
                  }}>
                  <span className="text-title font-medium mr-1" style={{ color: 'var(--ink-2)' }}>NT$</span>
                  {amount.toLocaleString('en-US')}
                </div>
              </div>
              {canSettle && (
                <div
                  className="self-center text-title transition-transform duration-200"
                  style={{
                    color: 'var(--ink-3)',
                    transform: settleOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}
                  aria-hidden="true"
                >
                  ⌄
                </div>
              )}
            </div>
          </button>

          {!settleOpen && (
            <div className="flex gap-2 mt-[18px]">
              <button onClick={onAddClick}
                className="flex-1 h-[46px] rounded-xl border-0 text-white font-semibold text-sm tracking-[0.3px] cursor-pointer flex items-center justify-center gap-1.5"
                style={{ background: 'var(--ink)' }}>
                <PlusIcon size={16} />{t.dashboard.addExpense}
              </button>
            </div>
          )}

          {settleOpen && canSettle && (
            <SettlementForm
              debtAmount={amount}
              viewerIsDebtor={balance < 0}
              onClose={() => setSettleOpen(false)}
              // onMutated signals success to the parent; SettlementForm itself calls
              // onClose() afterwards, so we don't double-close here.
              onMutated={() => onSettleMutated?.()}
            />
          )}
        </>
      )}

    </div>
  )
}
