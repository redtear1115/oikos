import Link from 'next/link'
import type { ReactNode } from 'react'
import { isLocale, type Locale } from '@/lib/i18n/locales-meta'
import { localizedHref } from '@/lib/i18n/path'
import { dictionaries } from '@/lib/i18n/t'
import { LanguageSwitcher } from '@/lib/i18n/LanguageSwitcher'
import { FutariMark } from '../_landing/FutariMark'

type Params = Promise<{ locale: string }>

export default async function UseCaseLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Params
}) {
  const { locale: raw } = await params
  const locale: Locale = isLocale(raw) ? raw : 'zh-TW'
  const t = dictionaries[locale].useCase
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
      <div
        aria-hidden
        className="hidden md:block absolute pointer-events-none"
        style={{ right: -140, top: 60, opacity: 0.05 }}
      >
        <FutariMark size={420} />
      </div>

      <header className="relative z-10 flex items-center justify-between gap-3 px-6 md:px-12 pt-3 md:pt-6 pb-1">
        <Link
          href={homeHref}
          className="flex items-center gap-2"
          style={{ textDecoration: 'none', color: 'var(--ink)' }}
        >
          <FutariMark size={22} />
          <span
            className="text-[17px] md:text-title font-medium"
            style={{ fontFamily: 'var(--font-fraunces)', letterSpacing: '-0.2px' }}
          >
            Futari
          </span>
        </Link>

        <div className="flex items-center gap-4">
          <Link
            href={homeHref}
            className="hidden md:inline-flex text-caption"
            style={{ color: 'var(--ink-2)', letterSpacing: '0.4px' }}
          >
            {t.backToHome}
          </Link>
          <LanguageSwitcher current={locale} variant="footer" mode="url" />
        </div>
      </header>

      <div className="relative z-10 px-5 md:px-12 pt-6 md:pt-10 pb-12 md:pb-16">
        <div className="mx-auto w-full max-w-[720px] md:max-w-[860px]">{children}</div>
      </div>
    </main>
  )
}
