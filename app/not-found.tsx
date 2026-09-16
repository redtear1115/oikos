import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from '@/lib/i18n/t'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations()
  return {
    title: t.notFoundPage.metadataTitle,
    robots: { index: false, follow: false },
  }
}

export default async function NotFound() {
  const t = await getTranslations()

  return (
    <main
      className="min-h-dvh flex flex-col items-center justify-center px-6 py-16 text-center"
      style={{ background: 'var(--bg)' }}
    >
      <div className="max-w-md w-full">
        <h1
          className="text-page mb-3"
          style={{ fontFamily: 'var(--font-fraunces)', color: 'var(--ink)', fontWeight: 500 }}
        >
          {t.notFoundPage.title}
        </h1>
        <p className="text-sm leading-relaxed mb-8" style={{ color: 'var(--ink-2)' }}>
          {t.notFoundPage.body}
        </p>

        <Link
          href="/dashboard"
          className="w-full inline-flex items-center justify-center gap-2 rounded-bubble font-medium oik-btn transition-opacity duration-150 h-[var(--control-lg)] px-6 text-base"
          style={{ background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
        >
          {t.notFoundPage.linkLedger}
        </Link>

        <Link
          href="/"
          className="block mt-6 text-sm underline-offset-4 hover:underline focus-visible:oik-focus-ring outline-none"
          style={{ color: 'var(--ink-2)' }}
        >
          {t.notFoundPage.linkHome}
        </Link>
      </div>
    </main>
  )
}
