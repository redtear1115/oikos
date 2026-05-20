export default function Loading() {
  return (
    <div className="relative max-w-md mx-auto min-h-dvh" style={{ background: 'var(--bg)' }}>
      {/* Avatar + name row */}
      <div
        className="flex items-center gap-3 px-5 pb-6"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 24px)' }}
      >
        <div className="h-12 w-12 rounded-full animate-pulse" style={{ background: 'var(--surface)', opacity: 0.6 }} />
        <div className="flex flex-col gap-2">
          <div className="h-4 w-28 rounded animate-pulse" style={{ background: 'var(--surface)', opacity: 0.6 }} />
          <div className="h-3 w-20 rounded animate-pulse" style={{ background: 'var(--surface)', opacity: 0.4 }} />
        </div>
      </div>

      {/* Setting rows */}
      <div className="mx-4 rounded-tile overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 h-[52px]" style={{ borderBottom: i < 4 ? '1px solid var(--hairline)' : undefined }}>
            <div className="h-4 w-4 rounded animate-pulse" style={{ background: 'var(--bg)', opacity: 0.7 }} />
            <div className="h-3 rounded animate-pulse flex-1" style={{ background: 'var(--bg)', opacity: 0.7, maxWidth: `${60 + (i % 3) * 15}%` }} />
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
