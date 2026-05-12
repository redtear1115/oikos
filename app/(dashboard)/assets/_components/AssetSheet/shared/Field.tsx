export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="py-3"
      style={{ borderBottom: '1px solid var(--hairline)' }}
    >
      <div className="text-xs mb-1 tracking-wide" style={{ color: 'var(--ink-3)' }}>{label}</div>
      {children}
    </div>
  )
}
