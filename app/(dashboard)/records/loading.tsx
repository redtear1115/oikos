export default function Loading() {
  return (
    <div className="relative min-h-screen pb-[var(--bottom-nav-offset)]">
      <div className="px-5 pt-[max(env(safe-area-inset-top),24px)] pb-2">
        <div
          className="text-2xl font-medium tracking-tight"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}
        >
          紀錄
        </div>
      </div>
      <div className="px-4 flex flex-col gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-bubble h-[68px] animate-pulse"
            style={{ background: 'var(--surface)', opacity: 0.6 }}
          />
        ))}
      </div>
    </div>
  )
}
