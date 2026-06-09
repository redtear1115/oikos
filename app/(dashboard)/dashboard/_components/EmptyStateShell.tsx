'use client'

import type { ReactNode } from 'react'

interface EmptyStateShellProps {
  /** Illustration node (FutariMark, constellation, ...). */
  illustration: ReactNode
  /** Optional serif title — the income variant omits it. */
  title?: ReactNode
  /** Body caption / hint. */
  caption: ReactNode
  /** CTA node — caller supplies the fully-styled button so each variant keeps
   *  its own affordance (accent Button vs mint pill). */
  cta?: ReactNode
  /**
   * 'card' wraps the content in a surface card (expense feed); 'bare' is a
   * centered column with airier spacing (income feed). Each variant emits the
   * exact shell its callers had before consolidation (#897).
   */
  variant: 'card' | 'bare'
}

/**
 * Shared empty-state skeleton: a centered illustration → (title) → caption →
 * CTA stack. Content lives in slots so the expense and income empty states can
 * share one ordering/shell while keeping their distinct illustrations and
 * affordances.
 */
export function EmptyStateShell({ illustration, title, caption, cta, variant }: EmptyStateShellProps) {
  if (variant === 'card') {
    return (
      <div className="px-4 pt-2">
        <div
          className="rounded-card p-8 text-center"
          style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
        >
          {illustration}
          {title}
          {caption}
          {cta}
        </div>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      {illustration}
      {caption}
      {cta}
    </div>
  )
}
