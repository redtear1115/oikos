'use client'

import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SheetBackdrop } from '@/app/(dashboard)/dashboard/_components/SheetBackdrop'
import { useFocusTrap } from '@/app/(dashboard)/_components/useFocusTrap'
import { useTranslations } from '@/lib/i18n/client'
import { leaveGroup, proposeSwap } from '@/actions/membership'
import { describeMembershipError } from '@/lib/membership-errors'

type Step = 1 | 2 | 3 | 4 | 'final' | 'swap-sent'

/** Id of the dialog title. Every step renders exactly one CardTitle, so the
 *  dialog's `aria-labelledby` always resolves to the current card's heading. */
const TitleIdContext = createContext<string | undefined>(undefined)

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

  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  // Tab stays inside the panel while open; focus returns to the "leave" row
  // on close (#1172). Call order relative to the focus effects below does not
  // matter: the trap records its restore target in a layout effect, and every
  // layout effect in a commit runs before every passive one, so the trigger is
  // captured before those effects move focus (#1230).
  useFocusTrap(open, panelRef)

  // Focus the panel itself on open — the screen reader announces the dialog
  // by the current card's title, and nothing destructive is pre-focused.
  useEffect(() => {
    if (open) panelRef.current?.focus()
  }, [open])

  // Step changes move focus to the new card's <h2> (#1242), the same move the
  // import wizard makes between steps (#1182). Two failures this covers:
  //  - the footer "next" survives the swap, so focus used to stay on it and
  //    nothing announced the new card — a VoiceOver user pressing "next"
  //    three times in a row walked past the step 2–3 warnings unheard;
  //  - card 4's yes/no and the swap-sent OK unmount, which dropped focus to
  //    <body> and restarted Tab from outside the dialog.
  // The cost is one extra Tab back to "next" for keyboard users; the heading
  // is what they are there to read. Skipped on open (the panel effect above
  // owns that) and while closed (the reset below changes step too).
  const lastStepRef = useRef(step)
  useEffect(() => {
    if (lastStepRef.current === step) return
    lastStepRef.current = step
    if (!open) return
    panelRef.current?.querySelector<HTMLElement>('h2')?.focus()
  }, [open, step])

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
        setErrorMsg(describeMembershipError(e, dz.errors, t.common.offlineError, t.errors.actions))
      }
    })
  }

  const handleLeave = () => {
    if (confirmInput.trim() !== flow.finalConfirm.confirmText) return
    setErrorMsg(null)
    startTransition(async () => {
      try {
        const { epochId } = await leaveGroup()
        // Mark the leaver's brand-new solo *epoch* so WelcomeSoloCard can
        // surface a dismissible "歡迎回到一個人" card on their first dashboard
        // render. Done client-side because the epoch only exists after the
        // server action resolves, before the navigation lands.
        //
        // Epoch-keyed since #1125, group-keyed before that. Both keys moved at
        // once — this one and `futari_welcome_solo_dismissed_` inside the card
        // — because moving only one would resurrect cards a user had already
        // dismissed. Same key space as `RemovePartnerFlow`'s
        // `futari_partner_removed_`.
        //
        // ⚠️ Known, bounded regression at deploy time: anyone who left the
        // ledger shortly before this shipped is carrying a
        // `futari_just_left_<groupId>` flag that no code reads any more, so
        // their one-shot welcome card silently never appears. No data loss, no
        // error, and the window is only as wide as "left but hasn't opened the
        // dashboard yet". Accepted deliberately — do not go re-adding a
        // group-keyed read path when someone reports the card missing.
        if (epochId) {
          try {
            window.localStorage.setItem('futari_just_left_' + epochId, '1')
          } catch {
            // Private-browsing localStorage failure: the welcome card simply
            // won't show. Not worth blocking the navigation.
          }
        }
        router.refresh()
        router.push('/dashboard')
      } catch (e) {
        setErrorMsg(describeMembershipError(e, dz.errors, t.common.offlineError, t.errors.actions))
      }
    })
  }

  const stepIndex = step === 'final' ? 5 : step === 'swap-sent' ? 5 : step
  const showStepIndicator = typeof step === 'number'

  // Explicit step transitions for the numbered cards (1–3). Card 4 has
  // role-specific branching handled inline. Returning the new step here
  // (instead of `(step ± 1) as Step` math) keeps Step union narrow and
  // type-safe — no cast required, and lifts the implicit "step is always 1/2/3
  // when these handlers fire" assumption to an explicit switch.
  const goBack = () => {
    switch (step) {
      case 1:
        handleClose()
        return
      case 2:
        setStep(1)
        return
      case 3:
        setStep(2)
        return
      // `final` is reachable only from step 4, so back means step 4. Without
      // this case the new footer button on `final` would be a dead control —
      // worse than no button, because it looks like a way out. (#1124)
      case 'final':
        setStep(4)
        return
    }
  }
  const goNext = () => {
    switch (step) {
      case 1:
        setStep(2)
        return
      case 2:
        setStep(3)
        return
      case 3:
        setStep(4)
        return
    }
  }

  return (
    <>
      <SheetBackdrop open={open} onClick={handleClose} />
      {/* Layout box only — it spans the viewport and pays the safe-area insets
          so the centred panel below can never grow into the notch. It stays
          `pointer-events: none` throughout: clicks outside the panel have to
          fall through to SheetBackdrop, which owns dismiss-by-backdrop.

          `env()` directly, NOT `var(--safe-top)`: globals.css zeroes
          `--safe-top` for every sibling after the shell top stack
          (`.shell-top-strip ~ *`, `.shell-top-stack:has(> *) ~ *`), and this
          flow renders inside settings, i.e. inside those siblings. The token
          would read 0px here, so the allowance would silently be no allowance
          at all — the markup would look fixed and the ✕ would still land under
          the Dynamic Island, with nothing to show for it. (#1124) */}
      <div
        className="fixed inset-0 z-modal flex items-center justify-center px-4"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
          pointerEvents: 'none',
        }}
      >
      <div
        ref={panelRef}
        tabIndex={-1}
        // Always mounted so the fade-out can play; `inert` is what keeps the
        // invisible closed panel out of the tab order and the a11y tree. Dialog
        // semantics only while open — same shape as SheetFrame (#1176, #1172).
        inert={!open}
        {...(open ? { role: 'dialog', 'aria-modal': true, 'aria-labelledby': titleId } : {})}
        className="w-full max-w-md max-h-full rounded-card flex flex-col focus:outline-none"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--hairline)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 200ms',
        }}
      >
        <TitleIdContext.Provider value={titleId}>
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
            // 44×44 hit area (#1172). The negative margins pull the box back
            // out so the glyph stays where it was and the header height is
            // unchanged; it still sits inside the safe-area-padded layout box.
            className="w-11 h-11 -mr-3 -my-3 flex items-center justify-center text-sm cursor-pointer disabled:opacity-50"
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
              className="mt-4 rounded-xl px-3 py-2 text-xs"
              style={{ background: 'var(--debit-soft)', color: 'var(--debit-text)' }}
              role="alert"
            >
              {errorMsg}
            </div>
          )}
        </div>

        {/* Footer nav for step 1-3, and for `final` — the riskiest step in the
            product had no exit at all except the ✕, which is exactly the
            control that safe-area failures eat. An escape route that depends
            on one unreachable affordance is not an escape route. (#1124)

            `flow.back` is reused rather than adding a `cancel` key: the same
            string already labels this button on steps 2-3, and going back to
            step 4 is literally what it does here. */}
        {(step === 1 || step === 2 || step === 3 || step === 'final') && (
          <div className="px-5 pb-5 pt-2 flex items-center justify-between gap-3 border-t" style={{ borderColor: 'var(--hairline)' }}>
            <button
              type="button"
              onClick={goBack}
              disabled={pending}
              className="h-11 px-4 rounded-xl text-sm font-medium cursor-pointer disabled:opacity-50"
              style={{
                background: 'var(--btn-secondary-bg)',
                color: 'var(--btn-secondary-text)',
                border: '1px solid var(--btn-secondary-border)',
              }}
            >
              {step === 1 ? flow.close : flow.back}
            </button>
            {/* No "next" on `final`: the forward action there is the
                destructive confirm inside FinalConfirm, behind a typed
                confirmation. A second primary button beside it would be a
                second way to leave, which is the opposite of the point. */}
            {step !== 'final' && (
              <button
                type="button"
                onClick={goNext}
                disabled={pending}
                className="h-11 px-5 rounded-xl text-sm font-medium cursor-pointer disabled:opacity-50"
                style={{ background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
              >
                {flow.next}
              </button>
            )}
          </div>
        )}
        </TitleIdContext.Provider>
      </div>
      </div>
    </>
  )
}

function CardTitle({ children }: { children: React.ReactNode }) {
  const id = useContext(TitleIdContext)
  return (
    <h2
      id={id}
      // Focus target on step change (see the step effect in LeaveGroupFlow).
      tabIndex={-1}
      className="text-base mb-3 leading-tight focus:outline-none"
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
          className="w-full h-12 rounded-bubble text-sm font-medium cursor-pointer disabled:opacity-50"
          style={{ background: 'var(--btn-destructive-bg)', color: 'var(--btn-destructive-text)' }}
        >
          {yesLabel}
        </button>
        <button
          type="button"
          onClick={onNo}
          disabled={pending}
          className="w-full h-12 rounded-bubble text-sm font-medium cursor-pointer disabled:opacity-50"
          style={{
            background: 'var(--btn-secondary-bg)',
            color: 'var(--btn-secondary-text)',
            border: '1px solid var(--btn-secondary-border)',
          }}
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
  const inputId = useId()
  return (
    <>
      <CardTitle>{t.title}</CardTitle>
      {!balanceOk ? (
        <>
          <p className="text-sm mb-4" style={{ color: 'var(--debit-text)' }}>
            {/* TODO(v0.17 currency): i18n template has `NT$ {amount}` baked in;
                 needs digits-only mode or removing the symbol from translations. */}
            {t.balanceNotZero.replace('{amount}', balanceAbs.toLocaleString())}
          </p>
          <button
            type="button"
            onClick={onSettle}
            className="w-full h-12 rounded-bubble text-sm font-medium cursor-pointer"
            style={{ background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
          >
            {t.settleCta}
          </button>
        </>
      ) : (
        <>
          <p className="text-sm mb-4" style={{ color: 'var(--ink-2)' }}>{t.balanceOk}</p>
          <label htmlFor={inputId} className="block text-xs mb-2" style={{ color: 'var(--ink-3)' }}>
            <span>{t.typePromptPrefix}</span>
            <span className="font-medium" style={{ color: 'var(--ink)' }}>{t.confirmText}</span>
            <span>{t.typePromptSuffix}</span>
          </label>
          <input
            id={inputId}
            type="text"
            value={confirmInput}
            onChange={(e) => onChangeInput(e.target.value)}
            placeholder={t.typePlaceholder}
            className="w-full h-12 rounded-xl px-3 text-sm mb-4 outline-none"
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
            className="w-full h-12 rounded-bubble text-sm font-medium cursor-pointer disabled:opacity-40"
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
        className="mt-6 w-full h-12 rounded-bubble text-sm font-medium cursor-pointer"
        style={{ background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
      >
        {t.ok}
      </button>
    </>
  )
}
