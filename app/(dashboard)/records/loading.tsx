export default function Loading() {
  return (
    <div className="relative max-w-md mx-auto min-h-dvh" style={{ background: 'var(--bg)' }}>
      {/* L1: title + 定期 shortcut — mirrors RecordsList's L1Header so the real
          page paints over the skeleton with no vertical shift. Both read
          --safe-top: whatever the shell top stack is holding, it holds it for
          the skeleton too, so the two agree without either of them knowing what
          is up there. (#1021 / #1037) */}
      <div className="px-5 pt-[max(var(--safe-top),24px)] pb-3 flex items-center justify-between">
        <div className="h-7 w-20 rounded animate-pulse" style={{ background: 'var(--surface)', opacity: 0.6 }} />
        <div className="h-4 w-12 rounded animate-pulse" style={{ background: 'var(--surface)', opacity: 0.5 }} />
      </div>

      {/* L2: 支出 / 收入 dual-toggle pill */}
      <div className="px-5 pb-3">
        <div className="h-[38px] w-40 rounded-full animate-pulse" style={{ background: 'var(--surface)', opacity: 0.6 }} />
      </div>

      {/* L3: month/date chip + filter chip row */}
      <div className="flex items-center gap-2 px-5 pb-3">
        <div className="h-8 w-28 rounded-full animate-pulse" style={{ background: 'var(--surface)', opacity: 0.6 }} />
        <div className="h-8 w-20 rounded-full animate-pulse" style={{ background: 'var(--surface)', opacity: 0.5 }} />
      </div>

      {/* Stats bar skeleton */}
      <div className="mx-4 mb-4 rounded-tile overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', height: 80 }}>
        <div className="h-full animate-pulse" style={{ background: 'var(--surface)', opacity: 0.6 }} />
      </div>

      {/* Month section header */}
      <div className="px-5 pb-2">
        <div className="h-3 w-16 rounded animate-pulse" style={{ background: 'var(--surface)', opacity: 0.5 }} />
      </div>

      {/* Record rows */}
      <div className="mx-4 rounded-tile overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 h-[68px]" style={{ borderBottom: i < 6 ? '1px solid var(--hairline)' : undefined }}>
            <div className="h-9 w-9 rounded-full animate-pulse" style={{ background: 'var(--bg)', opacity: 0.8 }} />
            <div className="flex-1 flex flex-col gap-1.5">
              <div className="h-3 rounded animate-pulse" style={{ background: 'var(--bg)', opacity: 0.8, width: `${50 + (i % 4) * 12}%` }} />
              <div className="h-2.5 w-16 rounded animate-pulse" style={{ background: 'var(--bg)', opacity: 0.6 }} />
            </div>
            <div className="h-4 w-14 rounded animate-pulse" style={{ background: 'var(--bg)', opacity: 0.8 }} />
          </div>
        ))}
      </div>

      {/* BottomNav placeholder */}
      <div
        className="fixed bottom-0 inset-x-0 max-w-md mx-auto"
        style={{ height: 'calc(64px + env(safe-area-inset-bottom))', background: 'var(--bg)', borderTop: '1px solid var(--hairline)' }}
      />
    </div>
  )
}
