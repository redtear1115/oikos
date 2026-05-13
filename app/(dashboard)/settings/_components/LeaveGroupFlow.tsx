'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SheetBackdrop } from '@/app/(dashboard)/dashboard/_components/SheetBackdrop'
import { useTranslations } from '@/lib/i18n/client'
import { leaveGroup, proposeSwap } from '@/actions/membership'
import { describeMembershipError } from '@/lib/membership-errors'

type Step = 1 | 2 | 3 | 4 | 'final' | 'swap-sent'

interface Props {
  open: boolean
  onClose: () => void
  viewerIsMemberA: boolean
  viewerName: string
  partnerName: string
  /** Signed balance from member_a POV. We only show |balance| in copy. */
  groupBalance: number
}

/**
 * 4-card walk-through that turns "I want to leave" into a paced decision.
 * Two role-specific exits at card 4:
 *   - member_b → final confirm card (balance check + type-to-confirm) → leaveGroup
 *   - member_a → proposeSwap → "swap sent" card (must wait for partner)
 */
export function LeaveGroupFlow({
  open,
  onClose,
  viewerIsMemberA,
  viewerName,
  partnerName,
  groupBalance,
}: Props) {
  const t = useTranslations()
  const dz = t.settings.dangerZone
  const flow = dz.flow
  const router = useRouter()

  const [step, setStep] = useState<Step>(1)
  const [confirmInput, setConfirmInput] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Reset state when sheet closes so the next open starts fresh.
  useEffect(() => {
    if (!open) {
      setStep(1)
      setConfirmInput('')
      setErrorMsg(null)
    }
  }, [open])

  const memberAName = viewerIsMemberA ? viewerName : partnerName
  const memberBName = viewerIsMemberA ? partnerName : viewerName
  const balanceAbs = Math.abs(groupBalance)
  const balanceOk = groupBalance === 0

  const card3Bullets = useMemo(
    () => flow.card3.bullets.map((b) =>
      b.replaceAll('{memberA}', memberAName).replaceAll('{memberB}', memberBName),
    ),
    [flow.card3.bullets, memberAName, memberBName],
  )

  const handleClose = () => {
    if (pending) return
    onClose()
  }

  const handleProposeSwap = () => {
    setErrorMsg(null)
    startTransition(async () => {
      try {
        await proposeSwap()
        setStep('swap-sent')
        router.refresh()
      } catch (e) {
        setErrorMsg(describeMembershipError(e, dz.errors, t.common.offlineError))
      }
    })
  }

  const handleLeave = () => {
    if (confirmInput.trim() !== flow.finalConfirm.confirmText) return
    setErrorMsg(null)
    startTransition(async () => {
      try {
        const { groupId: newGroupId } = await leaveGroup()
        // Mark the brand-new solo group so WelcomeSoloCard can surface a
        // dismissible "歡迎回到一個人" card on the leaver's first dashboard
        // render. Done client-side because the new groupId only exists after
        // the server action resolves, before the navigation lands.
        try {
          window.localStorage.setItem('futari_just_left_' + newGroupId, '1')
        } catch {
          // Private-browsing localStorage failure: the welcome card simply
          // won't show. Not worth blocking the navigation.
        }
        router.refresh()
        router.push('/dashboard')
      } catch (e) {
        setErrorMsg(describeMembershipError(e, dz.errors, t.common.offlineError))
      }
    })
  }

  const stepIndex = step === 'final' ? 5 : step === 'swap-sent' ? 5 : step
  const showStepIndicator = typeof step === 'number'

  return (
    <>
      <SheetBackdrop open={open} onClick={handleClose} />
      <div
        className="fixed left-1/2 top-1/2 z-[110] w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[20px] flex flex-col"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--hairline)',
          boxShadow: '0 20px 60px rgba(31,27,22,0.18)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 200ms',
          maxHeight: 'calc(100dvh - 64px)',
        }}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="text-xs" style={{ color: 'var(--ink-3)' }}>
            {showStepIndicator && flow.step
              .replace('{current}', String(stepIndex))
              .replace('{total}', '4')}
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={pending}
            className="text-sm cursor-pointer disabled:opacity-50"
            style={{ background: 'transparent', border: 'none', color: 'var(--ink-3)' }}
            aria-label={flow.close}
          >
            ✕
          </button>
        </div>

        <div className="px-6 pb-6 overflow-y-auto flex-1">
          {step === 1 && (
            <Card1
              viewerIsMemberA={viewerIsMemberA}
              partnerName={partnerName}
              t={flow.card1}
            />
          )}
          {step === 2 && <Card2 memberAName={memberAName} memberBName={memberBName} t={flow.card2} />}
          {step === 3 && <Card3 intro={flow.card3.intro} title={flow.card3.title.replaceAll('{memberB}', memberBName)} bullets={card3Bullets} />}
          {step === 4 && (
            <Card4
              viewerIsMemberA={viewerIsMemberA}
              t={flow.card4}
              onYes={() => {
                if (viewerIsMemberA) {
                  handleProposeSwap()
                } else {
                  setStep('final')
                }
              }}
              onNo={handleClose}
              pending={pending}
            />
          )}
          {step === 'final' && (
            <FinalConfirm
              t={flow.finalConfirm}
              balanceOk={balanceOk}
              balanceAbs={balanceAbs}
              confirmInput={confirmInput}
              onChangeInput={setConfirmInput}
              onLeave={handleLeave}
              onSettle={() => router.push('/dashboard')}
              pending={pending}
            />
          )}
          {step === 'swap-sent' && (
            <SwapSent
              partnerName={partnerName}
              t={flow.swapProposed}
              onClose={handleClose}
            />
          )}
          {errorMsg && (
            <div
              className="mt-4 rounded-[12px] px-3 py-2 text-xs"
              style={{ background: 'var(--debit-soft)', color: 'var(--debit)' }}
              role="alert"
            >
              {errorMsg}
            </div>
          )}
        </div>

        {/* Footer nav for step 1-3 */}
        {(step === 1 || step === 2 || step === 3) && (
          <div className="px-5 pb-5 pt-2 flex items-center justify-between gap-3 border-t" style={{ borderColor: 'var(--hairline)' }}>
            <button
              type="button"
              onClick={() => {
                if (step === 1) handleClose()
                else setStep((step - 1) as Step)
              }}
              disabled={pending}
              className="h-11 px-4 rounded-[12px] text-sm font-medium cursor-pointer disabled:opacity-50"
              style={{ background: 'transparent', color: 'var(--ink-2)', border: '1px solid var(--hairline)' }}
            >
              {step === 1 ? flow.close : flow.back}
            </button>
            <button
              type="button"
              onClick={() => setStep((step + 1) as Step)}
              disabled={pending}
              className="h-11 px-5 rounded-[12px] text-sm font-semibold cursor-pointer disabled:opacity-50"
              style={{ background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
            >
              {flow.next}
            </button>
          </div>
        )}
      </div>
    </>
  )
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-button mb-3 leading-tight"
      style={{ fontFamily: 'var(--font-fraunces)', color: 'var(--ink)', fontWeight: 500 }}
    >
      {children}
    </h2>
  )
}

function CardBody({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>
      {children}
    </p>
  )
}

function Card1({
  viewerIsMemberA,
  partnerName,
  t,
}: {
  viewerIsMemberA: boolean
  partnerName: string
  t: { titleA: string; titleB: string; bodyA: string; bodyB: string }
}) {
  const title = viewerIsMemberA ? t.titleA : t.titleB
  const body = (viewerIsMemberA ? t.bodyA : t.bodyB).replaceAll('{partner}', partnerName)
  return (
    <>
      <CardTitle>{title}</CardTitle>
      <CardBody>{body}</CardBody>
    </>
  )
}

function Card2({
  memberAName,
  memberBName,
  t,
}: {
  memberAName: string
  memberBName: string
  t: { title: string; body: string }
}) {
  return (
    <>
      <CardTitle>{t.title.replaceAll('{memberA}', memberAName).replaceAll('{memberB}', memberBName)}</CardTitle>
      <CardBody>{t.body.replaceAll('{memberA}', memberAName).replaceAll('{memberB}', memberBName)}</CardBody>
    </>
  )
}

function Card3({
  intro,
  title,
  bullets,
}: {
  intro: string
  title: string
  bullets: string[]
}) {
  return (
    <>
      <CardTitle>{title}</CardTitle>
      <p className="text-sm mb-3" style={{ color: 'var(--ink-2)' }}>{intro}</p>
      <ul className="text-sm space-y-2 list-disc pl-5" style={{ color: 'var(--ink-2)' }}>
        {bullets.map((b, i) => <li key={i}>{b}</li>)}
      </ul>
    </>
  )
}

function Card4({
  viewerIsMemberA,
  t,
  onYes,
  onNo,
  pending,
}: {
  viewerIsMemberA: boolean
  t: { title: string; body: string; yesB: string; yesASwap: string; no: string }
  onYes: () => void
  onNo: () => void
  pending: boolean
}) {
  const yesLabel = viewerIsMemberA ? t.yesASwap : t.yesB
  return (
    <>
      <CardTitle>{t.title}</CardTitle>
      <CardBody>{t.body}</CardBody>
      <div className="mt-6 flex flex-col gap-3">
        <button
          type="button"
          onClick={onYes}
          disabled={pending}
          className="w-full h-12 rounded-[14px] text-sm font-semibold cursor-pointer disabled:opacity-50"
          style={{ background: 'var(--btn-destructive-bg)', color: 'var(--btn-destructive-text)' }}
        >
          {yesLabel}
        </button>
        <button
          type="button"
          onClick={onNo}
          disabled={pending}
          className="w-full h-12 rounded-[14px] text-sm font-medium cursor-pointer disabled:opacity-50"
          style={{ background: 'transparent', color: 'var(--ink-2)', border: '1px solid var(--hairline)' }}
        >
          {t.no}
        </button>
      </div>
    </>
  )
}

function FinalConfirm({
  t,
  balanceOk,
  balanceAbs,
  confirmInput,
  onChangeInput,
  onLeave,
  onSettle,
  pending,
}: {
  t: {
    title: string
    balanceOk: string
    balanceNotZero: string
    settleCta: string
    typePromptPrefix: string
    typePromptSuffix: string
    typePlaceholder: string
    confirmText: string
    leaveButton: string
    leaving: string
  }
  balanceOk: boolean
  balanceAbs: number
  confirmInput: string
  onChangeInput: (v: string) => void
  onLeave: () => void
  onSettle: () => void
  pending: boolean
}) {
  const matched = confirmInput.trim() === t.confirmText
  return (
    <>
      <CardTitle>{t.title}</CardTitle>
      {!balanceOk ? (
        <>
          <p className="text-sm mb-4" style={{ color: 'var(--debit)' }}>
            {t.balanceNotZero.replace('{amount}', balanceAbs.toLocaleString())}
          </p>
          <button
            type="button"
            onClick={onSettle}
            className="w-full h-12 rounded-[14px] text-sm font-semibold cursor-pointer"
            style={{ background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
          >
            {t.settleCta}
          </button>
        </>
      ) : (
        <>
          <p className="text-sm mb-4" style={{ color: 'var(--ink-2)' }}>{t.balanceOk}</p>
          <label className="block text-xs mb-2" style={{ color: 'var(--ink-3)' }}>
            <span>{t.typePromptPrefix}</span>
            <span className="font-semibold" style={{ color: 'var(--ink)' }}>{t.confirmText}</span>
            <span>{t.typePromptSuffix}</span>
          </label>
          <input
            type="text"
            value={confirmInput}
            onChange={(e) => onChangeInput(e.target.value)}
            placeholder={t.typePlaceholder}
            className="w-full h-12 rounded-[12px] px-3 text-sm mb-4 outline-none"
            style={{
              background: 'var(--surface)',
              color: 'var(--ink)',
              border: '1px solid var(--hairline)',
            }}
          />
          <button
            type="button"
            onClick={onLeave}
            disabled={!matched || pending}
            className="w-full h-12 rounded-[14px] text-sm font-semibold cursor-pointer disabled:opacity-40"
            style={{ background: 'var(--btn-destructive-bg)', color: 'var(--btn-destructive-text)' }}
          >
            {pending ? t.leaving : t.leaveButton}
          </button>
        </>
      )}
    </>
  )
}

function SwapSent({
  partnerName,
  t,
  onClose,
}: {
  partnerName: string
  t: { title: string; body: string; ok: string }
  onClose: () => void
}) {
  return (
    <>
      <CardTitle>{t.title}</CardTitle>
      <CardBody>{t.body.replaceAll('{partner}', partnerName)}</CardBody>
      <button
        type="button"
        onClick={onClose}
        className="mt-6 w-full h-12 rounded-[14px] text-sm font-semibold cursor-pointer"
        style={{ background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
      >
        {t.ok}
      </button>
    </>
  )
}
