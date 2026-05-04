export function AssetEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center pt-16 pb-12 px-6 text-center">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
        aria-hidden="true"
      >
        {/* Placeholder illustration — designer to refine */}
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
          <path d="M5 13l1.5-4.5A2 2 0 018.4 7h7.2a2 2 0 011.9 1.5L19 13"
            stroke="var(--ink-3)" strokeWidth="1.4" strokeLinecap="round" />
          <rect x="3.5" y="13" width="17" height="5" rx="1.5"
            stroke="var(--ink-3)" strokeWidth="1.4" />
          <circle cx="7.5" cy="18" r="1.5" fill="var(--ink-3)" />
          <circle cx="16.5" cy="18" r="1.5" fill="var(--ink-3)" />
        </svg>
      </div>
      <div className="text-base font-medium mb-2" style={{ color: 'var(--ink)' }}>
        還沒有資產
      </div>
      <div className="text-sm leading-relaxed" style={{ color: 'var(--ink-3)', maxWidth: 240 }}>
        新增一台車，<br />開始追蹤它的開銷。
      </div>
    </div>
  )
}
