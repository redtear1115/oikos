'use client'

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-ink-2">{label}</label>
      {children}
    </div>
  )
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>
}

export function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-chip rounded-chip px-3.5 text-sm"
      style={{
        background: selected ? 'var(--ink)' : 'var(--surface)',
        color: selected ? 'var(--surface)' : 'var(--ink-2)',
        border: selected ? '1px solid var(--ink)' : '1px solid var(--hairline)',
      }}
    >
      {children}
    </button>
  )
}
