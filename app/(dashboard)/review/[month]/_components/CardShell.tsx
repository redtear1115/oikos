'use client'

import type { ReactNode } from 'react'

/**
 * Visual shell shared by all 4 review cards — fixed minimum height so the
 * carousel doesn't reflow when switching between dense and sparse cards,
 * and a per-card tint band at the top.
 */
export function CardShell({
  title,
  tint,
  children,
}: {
  title: string
  /** A CSS color (token or literal) used for the top accent band. */
  tint: string
  children: ReactNode
}) {
  return (
    <div
      className="rounded-[24px] overflow-hidden flex flex-col"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--hairline)',
        minHeight: 320,
      }}
    >
      <div
        className="h-1.5 w-full"
        style={{ background: tint }}
        aria-hidden="true"
      />
      <div className="px-5 pt-4 pb-5 flex-1 flex flex-col">
        <h2 className="text-sm font-medium tracking-wide" style={{ color: 'var(--ink-3)' }}>
          {title}
        </h2>
        <div className="mt-3 flex-1 flex flex-col">{children}</div>
      </div>
    </div>
  )
}

export function CardEmpty({
  body,
  cta,
  onCta,
}: {
  body: string
  cta?: string
  onCta?: () => void
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
      <div
        className="text-[40px] font-medium"
        style={{ fontFamily: 'var(--font-fraunces)', color: 'var(--ink-3)' }}
      >
        ok
      </div>
      <p className="text-sm mt-3" style={{ color: 'var(--ink-2)' }}>
        {body}
      </p>
      {cta && onCta && (
        <button
          type="button"
          onClick={onCta}
          className="mt-4 text-sm font-medium underline bg-transparent border-0 cursor-pointer"
          style={{ color: 'var(--ink-2)' }}
        >
          {cta}
        </button>
      )}
    </div>
  )
}

// TODO(v0.17 currency): formatNT returns digits-only; callers prepend "NT$ "
// (with space). Migrate to formatAmount once it gains a digits-only/no-symbol
// mode, or once design accepts the symbol-no-space convention.
export function formatNT(amount: number): string {
  return new Intl.NumberFormat('en-US').format(amount)
}
