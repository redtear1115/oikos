'use client'

import type { ReactNode } from 'react'

/**
 * One segment of a {@link SegmentedToggle}. Presentational only: the segment
 * reports `active` and fires `onClick`; the *selection model* (single-select,
 * dual-select with a ≥1 constraint, etc.) stays with the caller. This is why a
 * mode toggle, a settled/pending toggle, and the member dual-toggles can all
 * share one visual primitive without sharing one selection rule.
 */
export interface SegmentedOption {
  /** Stable key. */
  id: string
  /** Visible content. May embed adornments (status dots) as nodes. */
  label: ReactNode
  active: boolean
  onClick: () => void
  /** Active-state fill. Defaults to `--toggle-active-bg` (ink). Override for
   *  member-coloured (`--ink` / `--accent`) or income-mint segments. */
  fillColor?: string
  /** Active-state text colour. Defaults to `--toggle-active-text`. */
  activeTextColor?: string
  /** Accessible name when `label` is not plain readable text. */
  ariaLabel?: string
}

export type SegmentedToggleSize = 'sm' | 'md'

export interface SegmentedToggleProps {
  options: SegmentedOption[]
  /** `sm` ≈ 28px (dense rows: L3 filters, balance-view); `md` ≈ 32px (mode toggle). */
  size?: SegmentedToggleSize
  /** `role="group"` accessible name for the whole control. */
  ariaLabel?: string
  className?: string
}

// Heights + horizontal padding per size. Text steps with the size so the dense
// L3 row reads a notch smaller than the prominent mode toggle.
const segmentSize: Record<SegmentedToggleSize, string> = {
  sm: 'h-7 px-2.5 text-xs',
  md: 'h-8 px-3.5 text-sm',
}

/**
 * The shared segmented-control surface for the dashboard's pill toggles.
 * Owns the track, segment chrome, the `--toggle-*` tokens, the `.oik-segment`
 * focus ring, sizing, and ARIA. Replaces four hand-rolled implementations.
 */
export function SegmentedToggle({
  options,
  size = 'md',
  ariaLabel,
  className = '',
}: SegmentedToggleProps) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`inline-flex items-center shrink-0 gap-0.5 rounded-full p-0.5 ${className}`}
      style={{
        background: 'var(--toggle-inactive-bg)',
        border: '1px solid var(--hairline)',
      }}
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={o.onClick}
          aria-pressed={o.active}
          aria-label={o.ariaLabel}
          className={`oik-segment inline-flex items-center justify-center gap-1.5 cursor-pointer rounded-full border-0 font-medium transition-colors duration-150 ${segmentSize[size]}`}
          style={{
            background: o.active ? (o.fillColor ?? 'var(--toggle-active-bg)') : 'transparent',
            color: o.active ? (o.activeTextColor ?? 'var(--toggle-active-text)') : 'var(--toggle-inactive-text)',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
