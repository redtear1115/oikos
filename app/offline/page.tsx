import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from '@/lib/i18n/t'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations()
  return {
    title: t.offlinePage.metadataTitle,
    robots: { index: false, follow: false },
  }
}

export default async function OfflinePage() {
  const t = await getTranslations()

  return (
    <main
      className="min-h-dvh px-6 py-16"
      style={{ background: 'var(--bg)' }}
    >
      <div className="max-w-md mx-auto">
        <h1
          className="text-2xl mb-3"
          style={{ fontFamily: 'var(--font-fraunces)', color: 'var(--ink)', fontWeight: 500 }}
        >
          {t.offlinePage.title}
        </h1>
        <p className="text-sm leading-relaxed mb-8" style={{ color: 'var(--ink-2)' }}>
          {t.offlinePage.subtitle}
        </p>

        <div
          className="rounded-card overflow-hidden flex flex-col"
          style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
        >
          {[
            { href: '/dashboard', label: t.offlinePage.linkDashboard },
            { href: '/records', label: t.offlinePage.linkRecords },
            { href: '/assets', label: t.offlinePage.linkAssets },
          ].map((row, i) => (
            <Link
              key={row.href}
              href={row.href}
              className="flex items-center justify-between px-5 py-4 text-sm cursor-pointer transition-colors hover:bg-[color:var(--surface-alt)] focus-visible:oik-focus-ring outline-none"
              style={{
                color: 'var(--ink)',
                borderTop: i === 0 ? 'none' : '1px solid var(--hairline)',
              }}
            >
              <span className="font-medium">{row.label}</span>
              <span aria-hidden="true" style={{ color: 'var(--ink-3)' }}>›</span>
            </Link>
          ))}
        </div>

        <p className="text-xs mt-8 text-center" style={{ color: 'var(--ink-3)' }}>
          {t.offlinePage.footer}
        </p>
      </div>
    </main>
  )
}
