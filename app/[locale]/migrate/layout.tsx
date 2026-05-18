import Link from 'next/link'
import type { ReactNode } from 'react'
import { isLocale, type Locale } from '@/lib/i18n/locales-meta'
import { localizedHref } from '@/lib/i18n/path'
import { dictionaries } from '@/lib/i18n/t'
import { LanguageSwitcher } from '@/lib/i18n/LanguageSwitcher'
import { FutariMark } from '../_landing/FutariMark'

type Params = Promise<{ locale: string }>

/**
 * Shared shell for /[locale]/migrate/<source>. Provides the top bar (logo +
 * back link + lang switcher) and the page background so per-source pages
 * only render hero copy + <MigrateTool />.
 *
 * Anonymous-public: proxy.ts treats `/migrate/*` as a PUBLIC_LOCALIZED_PREFIX,
 * so unauthenticated visitors aren't bounced to /sign-in.
 */
export default async function MigrateLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Params
}) {
  const { locale: raw } = await params
  // Parent [locale] layout already 404s on invalid locale; fall back here too
  // so we can still build a typed dictionary lookup.
  const locale: Locale = isLocale(raw) ? raw : 'zh-TW'
  const t = dictionaries[locale].migrate
  const homeHref = localizedHref('/', locale)

  return (
    <main
      className="relative min-h-dvh overflow-hidden"
      style={{
        background: 'var(--bg)',
        color: 'var(--ink)',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <header className="relative z-10 flex items-center justify-between gap-3 px-6 md:px-12 pt-3 md:pt-6 pb-1">
        <Link
          href={homeHref}
          className="flex items-center gap-2"
          style={{ textDecoration: 'none', color: 'var(--ink)' }}
        >
          <FutariMark size={22} />
          <span
            className="text-[17px] md:text-[22px] font-medium"
            style={{ fontFamily: 'var(--font-fraunces)', letterSpacing: '-0.2px' }}
          >
            Futari
          </span>
        </Link>

        <div className="flex items-center gap-4">
          <Link
            href={homeHref}
            className="hidden md:inline-flex text-[12px]"
            style={{ color: 'var(--ink-2)', letterSpacing: '0.4px' }}
          >
            {t.backToHome}
          </Link>
          <LanguageSwitcher current={locale} variant="footer" mode="url" />
        </div>
      </header>

      <div className="relative z-10 px-5 md:px-12 pt-6 md:pt-10 pb-16 md:pb-24">
        <div className="mx-auto w-full max-w-[640px]">{children}</div>
      </div>
    </main>
  )
}
