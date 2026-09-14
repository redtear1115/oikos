'use client'

import { useState } from 'react'
import { SignInButton } from './SignInButton'

/**
 * Owns the shared "an attempt is in flight" state for both provider buttons and
 * paints a waiting curtain over the page while it is true (#1083).
 *
 * Why this exists at all: on the native shells the sign-in page is never
 * replaced during OAuth. The in-app browser opens ON TOP of it, so when the
 * deep link comes back and we close that browser, the user is looking at a
 * fully interactive sign-in form again — for as long as the /auth/callback
 * round-trip takes. A second tap there starts a fresh attempt whose appUrlOpen
 * listener dies with the page the first attempt is already navigating away
 * from, leaving an in-app browser open that nothing will ever answer.
 *
 * Both buttons share one flag deliberately: the second tap that breaks things
 * is just as likely to land on the other provider.
 */
export function SignInActions({
  googleLabel,
  appleLabel,
  pendingLabel,
}: {
  googleLabel: string
  appleLabel: string
  pendingLabel: string
}) {
  const [pending, setPending] = useState(false)

  const start = () => setPending(true)
  const abort = () => setPending(false)

  return (
    <>
      <SignInButton provider="google" label={googleLabel} pending={pending} onStart={start} onAbort={abort} />
      <SignInButton provider="apple" label={appleLabel} pending={pending} onStart={start} onAbort={abort} />
      {pending && <WaitingCurtain label={pendingLabel} />}
    </>
  )
}

/**
 * Opaque, not translucent: this is "the app is taking you somewhere", not a
 * modal over a page you are still in. It also has no dismiss affordance by
 * design — every path that will not navigate calls onAbort(), so the only way
 * this stays up is if a redirect really is in flight.
 */
function WaitingCurtain({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-modal flex flex-col items-center justify-center gap-3 px-6"
      // Committed ground, same as the sign-in page root (#1161). The curtain
      // speaks in the brand voice — the Fraunces wordmark — so under DESIGN.md
      // §2 The Two-Grounds Rule it belongs on --bg-committed. It used to be
      // --bg, which read as "an app screen wearing the serif". Inline because
      // --bg-committed has no --color-* utility twin (see page.tsx).
      style={{ background: 'var(--bg-committed)' }}
    >
      <p className="font-serif font-medium text-ink text-page leading-none tracking-[-1px] m-0">
        Futari
      </p>
      <p className="text-sm text-ink-2 tracking-[3px] m-0">
        ふたり
      </p>

      {/* Three lamps breathing in sequence. `motion-safe:` keeps the only other
        * infinite animation in the app off a vestibular-sensitive reader's
        * screen; the dots then simply rest visible, the same resting-state
        * treatment globals.css gives .animate-blink under reduced motion. */}
      <span className="mt-6 flex items-center gap-2" aria-hidden="true">
        {[0, 200, 400].map((delay) => (
          <span
            key={delay}
            className="w-2 h-2 rounded-full bg-accent motion-safe:animate-pulse"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>

      <p className="mt-2 text-base text-ink-2 m-0">
        {label}
      </p>
    </div>
  )
}
