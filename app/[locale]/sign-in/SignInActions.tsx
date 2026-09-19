'use client'

import { useEffect, useState } from 'react'
import { SignInButton, preloadNativeAuthModules } from './SignInButton'
import { WaitingCurtain } from './WaitingCurtain'

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

  // #1314 — fetch the native plugin chunks now, not on the tap.
  useEffect(() => {
    preloadNativeAuthModules()
  }, [])

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
