import type { ReactNode } from 'react'

/**
 * The calm "that didn't work, try again" block above the sign-in buttons.
 * Extracted from page.tsx's `authFailedNotice` (#973) so the iOS Apple fallback
 * hint (#1552) reuses the exact same markup instead of a look-alike — no new
 * token or class. The inline colours are the ones that block already used:
 * `--debit-soft` / `--debit-text` have no `--color-*` utility twin.
 *
 * No 'use client': it renders in the server page and inside SignInActions.
 */
export function SignInNotice({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="w-full m-0 rounded-xl px-4 py-3 text-sm text-center"
      style={{ background: 'var(--debit-soft)', color: 'var(--debit-text)' }}
    >
      {children}
    </p>
  )
}
