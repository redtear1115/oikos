export default function Loading() {
  return (
    <div className="relative max-w-md mx-auto min-h-dvh bg-bg">
      {/* Page title */}
      <div
        className="px-5 pb-4"
        style={{ paddingTop: 'max(var(--safe-top), 24px)' }}
      >
        <div className="h-6 w-16 rounded animate-pulse bg-surface opacity-60" />
      </div>

      {/* Asset cards */}
      <div className="flex flex-col gap-3 mx-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-tile animate-pulse bg-surface border border-hairline h-22"
            style={{ opacity: 0.7 - i * 0.1 }}
          />
        ))}
      </div>

      {/* BottomNav placeholder */}
      <div
        className="fixed bottom-0 inset-x-0 max-w-md mx-auto bg-bg border-t border-t-hairline"
        style={{ height: 'calc(64px + env(safe-area-inset-bottom))' }}
      />
    </div>
  )
}
