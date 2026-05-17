'use client'

/**
 * Section + Chip + AssetGroupSection primitives lifted out of FilterSheet
 * (#512 PR 6) so the main file can focus on the form orchestration.
 * Self-contained, no FilterSheet-specific state — usable by any future
 * chip-list filter UI in the same visual language.
 */

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium mb-2" style={{ color: 'var(--ink-3)' }}>{title}</div>
      <div className="flex gap-2 flex-wrap">{children}</div>
    </div>
  )
}

/**
 * Asset-type sub-section header — a small colored dot (matching the asset's
 * type tint) plus a label, mirroring the section labels on the /assets page so
 * the visual identity is consistent across the filter sheet and the asset list.
 * The chip-list inside is laid out the same as a plain Section.
 */
export function AssetGroupSection({
  label,
  dotColor,
  children,
}: {
  label: string
  dotColor: string
  children: React.ReactNode
}) {
  return (
    <div className="-mt-3">
      <div className="flex items-center gap-2 mb-2 px-0.5">
        <span
          aria-hidden="true"
          className="inline-block rounded-full shrink-0"
          style={{ width: 6, height: 6, background: dotColor }}
        />
        <div className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>{label}</div>
      </div>
      <div className="flex gap-2 flex-wrap">{children}</div>
    </div>
  )
}

/**
 * Generic chip used across every section. Optional `dotColor` paints a small
 * 6×6 dot to the left of the label — used by category chips to surface the
 * category's identity hue (matches feed icons / donut slices), so the same
 * 飲食 chip in the filter reads as the same hue family as a 飲食 row's badge.
 * Other dimensions (payer / split / status / 全選) omit the prop and render
 * as a plain pill.
 */
export function Chip({
  label,
  active,
  onClick,
  dotColor,
}: {
  label: string
  active: boolean
  onClick: () => void
  dotColor?: string
}) {
  return (
    <button
      onClick={onClick}
      className="oik-chip h-8 px-3 rounded-full text-xs font-medium cursor-pointer inline-flex items-center gap-1.5"
      style={{
        background: active ? 'var(--toggle-active-bg)' : 'var(--toggle-inactive-bg)',
        color: active ? 'var(--toggle-active-text)' : 'var(--toggle-inactive-text)',
        border: '1px solid var(--toggle-border)',
        transition: `background var(--toggle-transition), color var(--toggle-transition), border-color var(--toggle-transition)`,
      }}
    >
      {dotColor && (
        <span
          aria-hidden="true"
          className="inline-block rounded-full shrink-0"
          style={{ width: 6, height: 6, background: dotColor }}
        />
      )}
      {label}
    </button>
  )
}
