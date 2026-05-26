// Skeleton mirrors the real /settings page (SettingsContent.tsx + page.tsx):
// serif title row → QuickAccessRow → 應用 section (install + offline) → 資料
// section (5 link rows) → bottom-nav placeholder. The old skeleton drew a
// single rounded-tile list with 5 inset rows, which didn't match the actual
// layout (separate rounded-card per row) and caused visible jump on hand-off.
export default function Loading() {
  return (
    <div className="relative min-h-dvh pb-[var(--bottom-nav-offset)]">
      {/* Header: serif title + subtitle (matches SettingsContent header block). */}
      <div className="px-5 pt-[max(env(safe-area-inset-top),24px)] pb-4">
        <Bar className="h-7 w-20" tone="strong" />
        <Bar className="h-3 w-44 mt-2" tone="soft" />
      </div>

      {/* QuickAccessRow — single rounded-card with avatar cluster + label. */}
      <div className="px-4 mt-2 mb-5">
        <CardPlaceholder height={58} />
      </div>

      {/* 應用 — install guide + offline toggle (2 rows). */}
      <SectionPlaceholder rows={2} />

      {/* 資料 — 5 LinkRows (recurring / past-times / trips / import / trust). */}
      <SectionPlaceholder rows={5} />

      {/* BottomNav placeholder — static stand-in for BottomNavSkeleton. */}
      <div
        className="fixed bottom-0 inset-x-0 max-w-md mx-auto"
        style={{
          height: 'calc(64px + env(safe-area-inset-bottom))',
          background: 'var(--bg)',
          borderTop: '1px solid var(--hairline)',
        }}
      />
    </div>
  )
}

function Bar({ className, tone }: { className: string; tone: 'strong' | 'soft' }) {
  return (
    <div
      className={`rounded animate-pulse ${className}`}
      style={{ background: 'var(--surface)', opacity: tone === 'strong' ? 1 : 0.6 }}
    />
  )
}

function CardPlaceholder({ height }: { height: number }) {
  return (
    <div
      className="rounded-card animate-pulse"
      style={{
        height,
        background: 'var(--surface)',
        border: '1px solid var(--hairline)',
      }}
    />
  )
}

function SectionPlaceholder({ rows }: { rows: number }) {
  return (
    <div className="px-4 mt-2 mb-5">
      {/* Section header (text-xs label like 應用 / 資料). */}
      <div className="px-1 mb-2">
        <Bar className="h-3 w-10" tone="soft" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }).map((_, i) => (
          <CardPlaceholder key={i} height={52} />
        ))}
      </div>
    </div>
  )
}
