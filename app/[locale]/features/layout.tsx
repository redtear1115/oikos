import Link from 'next/link'
import type { ReactNode } from 'react'
import { isLocale, type Locale } from '@/lib/i18n/locales-meta'
import { localizedHref } from '@/lib/i18n/path'
import { dictionaries } from '@/lib/i18n/t'
import { LanguageSwitcher } from '@/lib/i18n/LanguageSwitcher'
import { s } from '../_components/brand-inner'
import { BrandInnerStyle } from '../_components/BrandInnerStyle'
import { BrandHome } from '../_components/BrandHome'

type Params = Promise<{ locale: string }>

/**
 * Brand shell for /features/* (#1633): the same lamp structure as
 * /use-case (app/[locale]/use-case/layout.tsx), copied rather than shared, as
 * /migrate already does. There is no /features index page; only the pages
 * under it exist.
 */
export default async function FeaturesLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Params
}) {
  const { locale: raw } = await params
  const locale: Locale = isLocale(raw) ? raw : 'zh-TW'
  const backToHome = dictionaries[locale].useCase.backToHome
  const homeHref = localizedHref('/', locale)

  return (
    <main
      id="main"
      className="relative min-h-dvh overflow-hidden"
      style={{
        background: 'var(--bg-committed)',
        color: 'var(--ink)',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <BrandInnerStyle />
      {/* Lamp structure (#1524): a warm pool of light behind the heading. */}
      <div aria-hidden className={s.pool} />

      <header className="relative z-10 flex items-center justify-between gap-3 px-6 md:px-12 pt-3 md:pt-6 pb-1">
        <BrandHome href={homeHref} label={dictionaries[locale].brand.homeLabel} />

        <div className="flex items-center gap-4">
          <Link
            href={homeHref}
            className="hidden md:inline-flex items-center min-h-11 min-w-11 text-xs"
            style={{ color: 'var(--ink-2)', letterSpacing: '0.4px' }}
          >
            {backToHome}
          </Link>
          <LanguageSwitcher current={locale} variant="footer" mode="url" />
        </div>
      </header>

      <div className="relative z-10 px-5 md:px-12 pt-6 md:pt-10 pb-12 md:pb-16">
        <div className={s.container}>{children}</div>
      </div>
    </main>
  )
}
