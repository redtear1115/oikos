'use client'

/**
 * Opaque, not translucent: this is "the app is taking you somewhere", not a
 * modal over a page you are still in. It also has no dismiss affordance by
 * design — every path that will not navigate calls onAbort(), so the only way
 * this stays up is if a redirect really is in flight.
 *
 * Shared by the OAuth attempt (SignInActions) and the stored-session check
 * that runs before any button is shown (useSignedInRedirect, #1318).
 */
export function WaitingCurtain({ label }: { label: string }) {
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
