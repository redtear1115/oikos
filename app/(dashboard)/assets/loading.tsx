export default function Loading() {
  return (
    <div className="relative max-w-md mx-auto min-h-dvh" style={{ background: 'var(--bg)' }}>
      {/* Page title */}
      <div
        className="px-5 pb-4"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 24px)' }}
      >
        <div className="h-6 w-16 rounded animate-pulse" style={{ background: 'var(--surface)', opacity: 0.6 }} />
      </div>

      {/* Asset cards */}
      <div className="flex flex-col gap-3 mx-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-tile animate-pulse"
            style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', height: 88, opacity: 0.7 - i * 0.1 }}
          />
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
