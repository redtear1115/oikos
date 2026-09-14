'use client'

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { TextInput } from '@/components/ui/TextInput'
import { createGroup } from '@/actions/group'
import { createInvite } from '@/actions/invite'
import { shareInviteLink } from '@/lib/share'
import { track } from '@/lib/analytics/track'
import { isStandalone } from '@/lib/install-guide'
import { InstallGuide } from '@/app/(dashboard)/_components/InstallGuide'
import { TrustCommitments } from '@/app/(dashboard)/settings/trust/_components/TrustCommitments'
import InviteQr from '@/app/setup/InviteQr'
import type { Translations } from '@/lib/i18n/locales/zh-TW'
const NAME_MAX = 20
const INSTALL_GUIDE_SEEN_KEY = 'oikos_install_guide_seen'

type Step = 'name' | 'trust' | 'invite'

interface CreatedGroup {
  id: string
  name: string
}

export default function SetupForm({ t }: { t: Translations }) {
  const trust = t.trust
  const invite = t.setup.invite
  const nameT = t.setup.name
  const nameHeadingId = useId()
  const nameHintId = useId()
  const nameCountId = useId()
  const router = useRouter()
  const [step, setStep] = useState<Step>('name')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const [group, setGroup] = useState<CreatedGroup | null>(null)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Whether the user has, at any point this session, successfully surfaced the
  // invite (revealed the QR, copied the link, or shared it) before hitting
  // skip. Answers "did they try before bailing?" — the split #1015 is built
  // around — with a single event instead of a fragile cross-event join.
  // What the user did about sending the invite, before they hit skip.
  // Three states rather than a boolean on purpose (#1015): "never tried" and
  // "tried but the clipboard/share failed" are different populations — one
  // doesn't want to invite, the other wanted to and the product got in the
  // way. Collapsing them into `false` invites the reading "72% don't want to
  // invite", which would be wrong for whatever slice hit a broken clipboard.
  // 'sent' only means something actually left the screen (copied / shared /
  // QR shown), not that the partner ever received it.
  const attemptedRef = useRef<'none' | 'failed' | 'sent'>('none')

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) { setError(nameT.required); return }
    setError('')
    setStep('trust')
  }

  const handleTrustConfirm = () => {
    const trimmed = name.trim()
    if (!trimmed) { setStep('name'); return }
    setError('')
    startTransition(async () => {
      try {
        const g = await createGroup(trimmed)
        const url = await createInvite()
        setGroup({ id: g.id, name: g.name })
        setInviteUrl(url)
        setStep('invite')
      } catch {
        // Always the localised message: a raw server `Error.message` here was
        // hardcoded zh-TW, so en / ja users read Chinese (#1166).
        setError(nameT.failed)
      }
    })
  }

  const flashToast = (msg: string) => {
    setToast(msg)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), 2000)
  }

  const handleCopy = async () => {
    if (!inviteUrl) return
    try {
      await navigator.clipboard.writeText(inviteUrl)
      attemptedRef.current = 'sent'
      track('invite_link_copied', { via: 'copy_button' })
      flashToast(invite.copied)
    } catch {
      // Clipboard API can reject in a non-secure context or when permission
      // is denied — surface it instead of leaving an unhandled rejection with
      // no user-visible feedback (see #1015).
      if (attemptedRef.current === 'none') attemptedRef.current = 'failed'
      track('invite_copy_failed', { via: 'copy_button' })
      flashToast(invite.shareFailed)
    }
  }

  const handleShare = async () => {
    if (!inviteUrl) return
    try {
      const result = await shareInviteLink(inviteUrl)
      attemptedRef.current = 'sent'
      if (result === 'copied') {
        track('invite_link_copied', { via: 'share_button' })
        flashToast(invite.copied)
      } else {
        track('invite_link_shared')
      }
    } catch {
      if (attemptedRef.current === 'none') attemptedRef.current = 'failed'
      track('invite_copy_failed', { via: 'share_button' })
      flashToast(invite.shareFailed)
    }
  }

  const [installGuideOpen, setInstallGuideOpen] = useState(false)

  const goToDashboard = () => {
    // Skip the install guide if (a) already a PWA, or (b) the user has seen it before.
    if (typeof window === 'undefined') {
      router.push('/dashboard')
      return
    }
    const alreadySeen = window.localStorage.getItem(INSTALL_GUIDE_SEEN_KEY) === 'true'
    if (isStandalone() || alreadySeen) {
      router.push('/dashboard')
      return
    }
    setInstallGuideOpen(true)
  }

  const dismissInstallGuide = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(INSTALL_GUIDE_SEEN_KEY, 'true')
    }
    setInstallGuideOpen(false)
    router.push('/dashboard')
  }

  const handleSkip = () => {
    track('invite_skipped', { attempted: attemptedRef.current })
    goToDashboard()
  }

  const installGuideJsx = (
    <InstallGuide open={installGuideOpen} onClose={dismissInstallGuide} t={t} source="setup" />
  )

  if (step === 'trust') {
    return (
      <>
      <main
        className="flex min-h-screen flex-col px-6 py-10"
        style={{ background: 'var(--bg)' }}
      >
        <div className="max-w-sm w-full mx-auto flex flex-col gap-6">
          <button
            type="button"
            onClick={() => setStep('name')}
            className="flex items-center gap-1.5 bg-transparent border-0 cursor-pointer p-1 -ml-1 self-start"
            style={{ color: 'var(--ink-2)', fontFamily: 'inherit', fontSize: 'var(--fs-sm)' }}
          >
            <svg width="8" height="13" viewBox="0 0 8 13" fill="none" aria-hidden="true">
              <path d="M7 1L1 6.5L7 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {trust.back}
          </button>

          <div>
            <h1
              className="text-page leading-tight"
              style={{ fontFamily: 'var(--font-fraunces)', color: 'var(--ink)', fontWeight: 500 }}
            >
              {trust.bilateral.inviter.heading}
            </h1>
            <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--ink-2)' }}>
              {trust.bilateral.inviter.subtitle}
            </p>
          </div>

          <TrustCommitments t={trust} />

          {error && (
            <p role="alert" className="text-sm" style={{ color: 'var(--debit-text)' }}>{error}</p>
          )}

          <button
            type="button"
            onClick={handleTrustConfirm}
            disabled={pending}
            className="h-12 rounded-xl border-0 text-sm font-medium cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
          >
            {pending ? invite.creating : trust.bilateral.inviter.cta}
          </button>
        </div>
      </main>
      {installGuideJsx}
      </>
    )
  }

  if (step === 'invite' && group && inviteUrl) {
    return (
      <>
      <main
        className="flex min-h-screen flex-col px-6 py-10"
        style={{ background: 'var(--bg)' }}
      >
        <div className="max-w-sm w-full mx-auto flex flex-col gap-6">
          <div>
            <h1
              className="text-page leading-tight"
              style={{ fontFamily: 'var(--font-fraunces)', color: 'var(--ink)', fontWeight: 500 }}
            >
              {invite.heading}
            </h1>
            <p className="text-sm mt-2" style={{ color: 'var(--ink-2)' }}>
              {invite.subtitle.replace('{name}', group.name)}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <InviteQr
              url={inviteUrl}
              t={invite}
              onReveal={() => { attemptedRef.current = 'sent' }}
            />
            <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
              {invite.qrHint}
            </p>
          </div>

          <div className="h-px" style={{ background: 'var(--hairline)' }} aria-hidden="true" />

          <div className="flex flex-col gap-2">
            <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
              {invite.linkHint}
            </p>
            <div
              className="rounded-2xl px-4 py-3 flex items-center gap-3"
              style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
            >
              <div className="flex-1 min-w-0 text-xs break-all" style={{ color: 'var(--ink-2)' }}>
                {inviteUrl}
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="h-9 px-3 rounded-lg border-0 text-sm font-medium cursor-pointer shrink-0"
                style={{ background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
              >
                {invite.copy}
              </button>
            </div>

            <button
              type="button"
              onClick={handleShare}
              className="h-12 rounded-xl border-0 text-sm font-medium cursor-pointer"
              style={{ background: 'var(--accent)', color: 'var(--on-fill)' }}
            >
              {invite.share}
            </button>
          </div>

          <div
            className="rounded-2xl px-4 py-3.5 flex flex-col gap-2"
            style={{ background: 'var(--surface-alt)' }}
          >
            {[trust.onboarding.line1, trust.onboarding.line2, trust.onboarding.line3].map((line, i) => (
              <div
                key={i}
                className="text-xs flex items-start gap-2 leading-relaxed"
                style={{ color: 'var(--ink-2)' }}
              >
                <span
                  className="w-1 h-1 rounded-full mt-1.5 shrink-0"
                  style={{ background: 'var(--ink-3)' }}
                  aria-hidden="true"
                />
                <span>{line}</span>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={handleSkip}
            className="text-sm bg-transparent border-0 cursor-pointer mt-2"
            style={{ color: 'var(--ink-2)' }}
          >
            {invite.skip}
          </button>

          {/* Live region stays mounted so screen readers announce the toast
              when its text appears (copy / share feedback). */}
          <div role="status" aria-live="polite" className="text-xs text-center" style={{ color: 'var(--ink-2)' }}>
            {toast}
          </div>
        </div>
      </main>
      {installGuideJsx}
      </>
    )
  }

  return (
    <>
    <main
      className="flex min-h-screen flex-col px-6 py-10"
      style={{ background: 'var(--bg)' }}
    >
      <form onSubmit={handleNameSubmit} className="max-w-sm w-full mx-auto flex flex-col gap-6">
        <div>
          <h1
            id={nameHeadingId}
            className="text-page leading-tight"
            style={{ fontFamily: 'var(--font-fraunces)', color: 'var(--ink)', fontWeight: 500 }}
          >
            {nameT.heading}
          </h1>
          <p id={nameHintId} className="text-sm mt-2" style={{ color: 'var(--ink-2)' }}>
            {nameT.subtitle}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <TextInput
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
            maxLength={NAME_MAX}
            placeholder=""
            // The heading is the field's visible label; the subtitle and
            // counter describe it (#1166 — was announced as "edit text, blank").
            aria-labelledby={nameHeadingId}
            aria-describedby={`${nameHintId} ${nameCountId}`}
            aria-invalid={error ? true : undefined}
            autoFocus
            rightAddon={
              <span id={nameCountId} className="text-xs tnum shrink-0 pr-1.5" style={{ color: 'var(--ink-3)' }}>
                {name.length}/{NAME_MAX}
              </span>
            }
          />
          <div className="flex gap-2 flex-wrap">
            {nameT.suggestions.map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => setName(s)}
                className="h-8 px-3 rounded-full text-xs cursor-pointer"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--hairline)',
                  color: 'var(--ink-2)',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm" style={{ color: 'var(--debit-text)' }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={!name.trim()}
          className="h-12 rounded-xl border-0 text-sm font-medium cursor-pointer disabled:opacity-50"
          style={{ background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
        >
          {nameT.next}
        </button>
      </form>
    </main>
    {installGuideJsx}
    </>
  )
}
