export default function Loading() {
  return (
    <div className="relative max-w-md mx-auto min-h-dvh" style={{ background: 'var(--bg)' }}>
      {/* BrandHeader skeleton: safe-area top + two avatar circles */}
      <div
        className="flex items-center justify-between px-5 pb-2"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 24px)' }}
      >
        <div className="h-8 w-8 rounded-full animate-pulse" style={{ background: 'var(--surface)', opacity: 0.6 }} />
        <div className="h-5 w-16 rounded-full animate-pulse" style={{ background: 'var(--surface)', opacity: 0.6 }} />
        <div className="h-8 w-8 rounded-full animate-pulse" style={{ background: 'var(--surface)', opacity: 0.6 }} />
      </div>

      {/* BalanceHero skeleton: big number + subtitle */}
      <div className="px-6 pt-6 pb-4 flex flex-col items-center gap-3">
        <div className="h-4 w-24 rounded-full animate-pulse" style={{ background: 'var(--surface)', opacity: 0.6 }} />
        <div className="h-12 w-40 rounded-xl animate-pulse" style={{ background: 'var(--surface)', opacity: 0.6 }} />
        <div className="h-3 w-32 rounded-full animate-pulse" style={{ background: 'var(--surface)', opacity: 0.4 }} />
      </div>

      {/* Filter row skeleton: 2 toggle pill placeholders */}
      <div className="flex gap-2 px-5 pb-3">
        <div className="h-8 w-20 rounded-full animate-pulse" style={{ background: 'var(--surface)', opacity: 0.6 }} />
        <div className="h-8 w-24 rounded-full animate-pulse" style={{ background: 'var(--surface)', opacity: 0.6 }} />
      </div>

      {/* Feed skeleton: section header + 5 rows */}
      <div className="px-6 pt-2 pb-1">
        <div className="h-3 w-20 rounded animate-pulse" style={{ background: 'var(--surface)', opacity: 0.5 }} />
      </div>
      <div className="mx-4 rounded-tile overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 h-[68px]" style={{ borderBottom: i < 4 ? '1px solid var(--hairline)' : undefined }}>
            <div className="h-9 w-9 rounded-full animate-pulse" style={{ background: 'var(--bg)', opacity: 0.8 }} />
            <div className="flex-1 flex flex-col gap-1.5">
              <div className="h-3 rounded animate-pulse" style={{ background: 'var(--bg)', opacity: 0.8, width: `${55 + (i % 3) * 15}%` }} />
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
