'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from '@/lib/i18n/client'
import { formatAmount } from '@/lib/currency'
import { unwrapAction } from '@/lib/action-errors'
import { describeError } from '@/lib/errors'
import { track } from '@/lib/analytics/track'
import { bindOutingParticipant } from '@/actions/outing'
import { Button } from '@/components/ui/Button'
import type { OutingFullView } from '@/lib/db/queries/outingPublic'
import { SettleSheet } from '@/app/(dashboard)/outings/[id]/_components/SettleSheet'
import { Card, OutingHeader, SectionTitle } from './OutingPublicChrome'

interface Props {
  view: Omit<OutingFullView, 'isAdmin'>
  /** Signed in, holding this device's claim cookie, slot not yet linked. */
  needsBind: boolean
  signedIn: boolean
  /** /<locale>/sign-in?next=/<locale>/outing/r/<id>&from=outing */
  signInHref: string
}

/**
 * A friend's full view of an outing (#1558): who is in it and their nets, who
 * pays whom, the expense feed, and recording a repayment. Ended outings are
 * read-only. Adding / editing / deleting expenses comes from S4's shared
 * components (phase 2).
 */
export function OutingParticipantView({ view, needsBind, signedIn, signInHref }: Props) {
  const t = useTranslations()
  const c = t.outingPublic
  const to = t.outing
  const router = useRouter()
  const { outing } = view
  const active = outing.status === 'active'
  const [settling, setSettling] = useState(false)
  const [bindHidden, setBindHidden] = useState(false)
  const [bindError, setBindError] = useState('')
  const [binding, startBind] = useTransition()

  const nameOf = useMemo(() => {
    const m = new Map(view.participants.map((p) => [p.id, p.displayName]))
    return (id: string) => m.get(id) ?? '—'
  }, [view.participants])
  const youName = view.youParticipantId ? nameOf(view.youParticipantId) : ''
  const shown = view.participants.filter((p) => p.active || p.net !== 0)
  const settleable = view.participants.filter((p) => p.active).map((p) => ({ id: p.id, displayName: p.displayName }))

  const bind = () => {
    setBindError('')
    startBind(async () => {
      try {
        unwrapAction(await bindOutingParticipant({ outingId: outing.id }))
        track('outing_bound')
        router.refresh()
      } catch (e) {
        setBindError(describeError(e, t.common.error, t.common.offlineError, t.errors.actions))
      }
    })
  }

  return (
    <div className="pb-12">
      <OutingHeader title={outing.name} />

      <div className="px-4 pt-4 flex flex-col gap-5">
        {needsBind && !bindHidden && (
          <Card>
            <SectionTitle>{c.bindTitle}</SectionTitle>
            <p className="text-sm text-ink-3 mb-3">{c.bindBody.replace('{name}', youName)}</p>
            {bindError && <p role="alert" className="mb-3 text-sm text-[var(--debit-text)]">{bindError}</p>}
            <div className="flex gap-2.5">
              <Button variant="primary" loading={binding} onClick={bind} className="flex-1">{c.bindConfirm}</Button>
              <Button variant="ghost" disabled={binding} onClick={() => setBindHidden(true)}>{c.bindDismiss}</Button>
            </div>
          </Card>
        )}

        <Card>
          <SectionTitle>{to.participantsLabel}</SectionTitle>
          <div className="flex flex-col">
            {shown.map((p, i) => (
              <div
                key={p.id}
                className={`flex items-center justify-between gap-3 py-2.5${i === shown.length - 1 ? '' : ' border-b border-hairline'}`}
              >
                <span className="text-sm truncate text-ink">
                  {p.displayName}
                  {p.id === view.youParticipantId && <span className="ml-1.5 text-xs text-ink-3">{c.youTag}</span>}
                </span>
                <NetAmount net={p.net} currency={outing.currency} />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionTitle>{to.transfersLabel}</SectionTitle>
          {view.transfers.length === 0 ? (
            <p className="text-sm text-ink-3">{to.allSettled}</p>
          ) : (
            <div className="flex flex-col">
              {view.transfers.map((tr, i) => (
                <div
                  key={`${tr.from}-${tr.to}-${i}`}
                  className={`flex items-center justify-between gap-3 py-2.5${i === view.transfers.length - 1 ? '' : ' border-b border-hairline'}`}
                >
                  <span className="text-sm truncate text-ink">
                    {to.transferRow.replace('{from}', nameOf(tr.from)).replace('{to}', nameOf(tr.to))}
                  </span>
                  <span className="text-sm tabular-nums shrink-0 text-ink-2">{formatAmount(tr.amount, outing.currency)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle>{to.expensesLabel}</SectionTitle>
          {view.expenses.length === 0 ? (
            <p className="text-sm text-ink-3">{to.emptyExpenses}</p>
          ) : (
            <div className="flex flex-col">
              {view.expenses.map((e, i) => (
                <div
                  key={e.id}
                  className={`flex items-center justify-between gap-3 py-2.5${i === view.expenses.length - 1 ? '' : ' border-b border-hairline'}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate text-ink">{e.description || to.untitledExpense}</div>
                    <div className="text-xs mt-0.5 text-ink-3">
                      {to.paidByTag.replace('{name}', nameOf(e.paidByParticipantId))}
                      {' · '}
                      {to.splitCountTag.replace('{count}', String(e.shares.length))}
                    </div>
                  </div>
                  <span className="text-sm tabular-nums shrink-0 text-ink">{formatAmount(e.amount, outing.currency)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {active ? (
          <Button variant="secondary" onClick={() => setSettling(true)}>{to.settle}</Button>
        ) : (
          <p className="text-sm px-1 text-ink-3">{c.endedNote}</p>
        )}

        {!signedIn && (
          <Card>
            <SectionTitle>{c.signUpTitle}</SectionTitle>
            <p className="text-sm text-ink-3 mb-3">{c.signUpBody.replace('{name}', youName)}</p>
            <a
              href={signInHref}
              rel="noreferrer"
              className="inline-flex w-full items-center justify-center rounded-bubble font-medium h-[var(--control-md)] px-5 text-base bg-[var(--btn-secondary-bg)] text-[var(--btn-secondary-text)] border border-[var(--btn-secondary-border)]"
            >
              {c.signUpCta}
            </a>
          </Card>
        )}
      </div>

      {active && (
        <SettleSheet
          open={settling}
          outingId={outing.id}
          currency={outing.currency}
          participants={settleable}
          onClose={() => setSettling(false)}
          onSaved={() => track('outing_settlement_recorded', { actor: 'participant' })}
        />
      )}
    </div>
  )
}

function NetAmount({ net, currency }: { net: number; currency: string }) {
  if (net === 0) {
    return <span className="text-sm tabular-nums shrink-0 text-ink-3">{formatAmount(0, currency)}</span>
  }
  const positive = net > 0
  return (
    <span className={`text-sm tabular-nums shrink-0 ${positive ? 'text-[var(--credit)]' : 'text-[var(--debit-quiet)]'}`}>
      {positive ? '+' : '−'}{formatAmount(Math.abs(net), currency)}
    </span>
  )
}
