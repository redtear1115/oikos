'use client'

import { useMemo, useState } from 'react'
import { SubpageHeader } from '@/app/(dashboard)/_components/SubpageHeader'
import { useTranslations } from '@/lib/i18n/client'
import { useRouter } from 'next/navigation'
import { formatAmount } from '@/lib/currency'
import type { OutingView } from '@/lib/outing/view'
import type { OutingExpenseWithShares } from '@/lib/db/queries/outing'
import { Button } from '@/components/ui/Button'
import { AddExpenseSheet } from './AddExpenseSheet'
import { AddParticipantSheet } from './AddParticipantSheet'
import { SettleSheet } from './SettleSheet'
import { EndOutingSheet } from './EndOutingSheet'

type SheetKey = 'expense' | 'participant' | 'settle' | 'end' | null

export interface OutingDetailOuting {
  id: string
  name: string
  currency: string
  status: 'active' | 'settling' | 'ended' | 'archived'
  shareToken: string
}

interface Props {
  outing: OutingDetailOuting
  view: OutingView
  coupleNet: number
  expenses: OutingExpenseWithShares[]
  participants: { id: string; displayName: string }[]
}

// Deterministic warm dot per participant, cycling the existing asset hue family
// (no new tokens). Index = participant order.
const DOT_HUES = [
  'var(--asset-color-car)', 'var(--asset-color-house)', 'var(--asset-color-child)',
  'var(--asset-color-pet)', 'var(--asset-color-plant)', 'var(--asset-color-insurance)',
]

export function OutingDetailClient({ outing, view, coupleNet, expenses, participants }: Props) {
  const t = useTranslations()
  const to = t.outing
  const router = useRouter()
  const [sheet, setSheet] = useState<SheetKey>(null)
  const active = outing.status === 'active'
  const close = () => setSheet(null)
  const refresh = () => router.refresh()
  const nameOf = useMemo(() => {
    const m = new Map(participants.map((p) => [p.id, p.displayName]))
    return (id: string) => m.get(id) ?? '—'
  }, [participants])
  const dotOf = useMemo(() => {
    const idx = new Map(participants.map((p, i) => [p.id, i]))
    return (id: string) => DOT_HUES[(idx.get(id) ?? 0) % DOT_HUES.length]
  }, [participants])

  return (
    <div className="relative min-h-screen pb-[var(--bottom-nav-offset)]">
      <SubpageHeader title={outing.name} backLabel={t.common.back} />

      <div className="px-4 pt-5 flex flex-col gap-5">
        <ShareCard shareToken={outing.shareToken} label={to.shareLabel} copyLabel={to.copyLink} copiedLabel={to.copied} />

        {/* Participants + nets */}
        <Card>
          <SectionTitle>{to.participantsLabel}</SectionTitle>
          <div className="flex flex-col">
            {view.participants.map((p, i) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 py-2.5"
                style={{ borderBottom: i === view.participants.length - 1 ? 'none' : '1px solid var(--hairline)' }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span aria-hidden="true" className="inline-block rounded-full shrink-0" style={{ width: 9, height: 9, background: dotOf(p.id) }} />
                  <span className="text-sm truncate" style={{ color: 'var(--ink)' }}>{p.displayName}</span>
                </div>
                <NetAmount net={p.net} currency={outing.currency} />
              </div>
            ))}
          </div>
        </Card>

        {/* Who pays whom */}
        <Card>
          <SectionTitle>{to.transfersLabel}</SectionTitle>
          {view.transfers.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--ink-3)' }}>{to.allSettled}</p>
          ) : (
            <div className="flex flex-col">
              {view.transfers.map((tr, i) => (
                <div
                  key={`${tr.from}-${tr.to}-${i}`}
                  className="flex items-center justify-between gap-3 py-2.5"
                  style={{ borderBottom: i === view.transfers.length - 1 ? 'none' : '1px solid var(--hairline)' }}
                >
                  <span className="text-sm truncate" style={{ color: 'var(--ink)' }}>
                    {to.transferRow.replace('{from}', nameOf(tr.from)).replace('{to}', nameOf(tr.to))}
                  </span>
                  <span className="text-sm tabular-nums shrink-0" style={{ color: 'var(--ink-2)' }}>
                    {formatAmount(tr.amount, outing.currency)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Expenses */}
        <Card>
          <SectionTitle>{to.expensesLabel}</SectionTitle>
          {expenses.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--ink-3)' }}>{to.emptyExpenses}</p>
          ) : (
            <div className="flex flex-col">
              {expenses.map((e, i) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                  style={{ borderBottom: i === expenses.length - 1 ? 'none' : '1px solid var(--hairline)' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate" style={{ color: 'var(--ink)' }}>{e.description || to.untitledExpense}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
                      {to.paidByTag.replace('{name}', nameOf(e.paidByParticipantId))}
                      {' · '}
                      {to.splitCountTag.replace('{count}', String(e.shares.length))}
                    </div>
                  </div>
                  <span className="text-sm tabular-nums shrink-0" style={{ color: 'var(--ink)' }}>
                    {formatAmount(e.amount, outing.currency)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {coupleNet !== 0 && (
          <p className="text-xs px-1" style={{ color: 'var(--ink-3)' }}>
            {to.coupleFoldNote.replace('{amount}', formatAmount(Math.abs(coupleNet), outing.currency))}
          </p>
        )}

        {!active && (
          <p className="text-sm px-1" style={{ color: 'var(--ink-3)' }}>{to.endedNote}</p>
        )}

        {active && (
          <div className="flex flex-col gap-2.5 pt-1">
            <Button variant="primary" onClick={() => setSheet('expense')}>{to.addExpense}</Button>
            <div className="flex gap-2.5">
              <Button variant="secondary" onClick={() => setSheet('participant')} className="flex-1">{to.addParticipant}</Button>
              <Button variant="secondary" onClick={() => setSheet('settle')} className="flex-1">{to.settle}</Button>
            </div>
            <Button variant="ghost" onClick={() => setSheet('end')}>{to.endOuting}</Button>
          </div>
        )}
      </div>

      <AddExpenseSheet
        open={sheet === 'expense'}
        outingId={outing.id}
        currency={outing.currency}
        participants={participants}
        onClose={close}
        onSaved={refresh}
      />
      <AddParticipantSheet open={sheet === 'participant'} outingId={outing.id} onClose={close} onSaved={refresh} />
      <SettleSheet
        open={sheet === 'settle'}
        outingId={outing.id}
        currency={outing.currency}
        participants={participants}
        onClose={close}
        onSaved={refresh}
      />
      <EndOutingSheet open={sheet === 'end'} outingId={outing.id} onClose={close} onSaved={refresh} />
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-card p-4" style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
      {children}
    </section>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-sm font-medium mb-2" style={{ color: 'var(--ink-2)' }}>{children}</div>
}

function NetAmount({ net, currency }: { net: number; currency: string }) {
  if (net === 0) {
    return <span className="text-sm tabular-nums shrink-0" style={{ color: 'var(--ink-3)' }}>{formatAmount(0, currency)}</span>
  }
  const positive = net > 0
  return (
    <span
      className="text-sm tabular-nums shrink-0"
      style={{ color: positive ? 'var(--credit)' : 'var(--debit-quiet)' }}
    >
      {positive ? '+' : '−'}{formatAmount(Math.abs(net), currency)}
    </span>
  )
}

function ShareCard({ shareToken, label, copyLabel, copiedLabel }: { shareToken: string; label: string; copyLabel: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false)
  const path = `/outing/${shareToken}`
  const handleCopy = async () => {
    const url = typeof window !== 'undefined' ? window.location.origin + path : path
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable — no-op */
    }
  }
  return (
    <section className="rounded-card p-4 flex items-center justify-between gap-3" style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
      <div className="min-w-0">
        <div className="text-sm font-medium mb-1" style={{ color: 'var(--ink-2)' }}>{label}</div>
        <div className="text-xs truncate" style={{ color: 'var(--ink-3)' }}>{path}</div>
      </div>
      <button
        type="button"
        onClick={handleCopy}
        className="shrink-0 rounded-bubble px-4 text-sm font-medium"
        style={{ height: 'var(--control-sm)', background: 'var(--surface)', border: '1px solid var(--ink-3)', color: 'var(--ink)' }}
      >
        {copied ? copiedLabel : copyLabel}
      </button>
    </section>
  )
}
