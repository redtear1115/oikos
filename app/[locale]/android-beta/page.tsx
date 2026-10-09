import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SUPPORTED_LOCALES, isLocale, type Locale } from '@/lib/i18n/locales-meta'
import { dictionaries } from '@/lib/i18n/t'
import { localizedHref } from '@/lib/i18n/path'
import { ANDROID_TEST_GROUP_URL, ANDROID_TEST_OPTIN_URL } from '@/lib/visitorPlatform'
import { AndroidBetaSteps } from './_components/AndroidBetaSteps'

type Params = Promise<{ locale: string }>

// One static HTML per locale; zh-TW is unprefixed and rewritten by the proxy.
export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }))
}

/**
 * Self-serve Android closed-test join page (#1648). Reached from the landing
 * CTA and the dashboard card, never from search: `noindex`, and deliberately
 * absent from app/sitemap.ts (tests/seo-sitemap-robots.test.ts pins both).
 * Failure of that looks like a temporary tester page showing up in results.
 * Temporary: removed with #1553.
 */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale: raw } = await params
  if (!isLocale(raw)) return {}
  return {
    title: dictionaries[raw].androidBeta.metaTitle,
    robots: { index: false },
  }
}

export default async function AndroidBetaPage({ params }: { params: Params }) {
  const { locale: raw } = await params
  if (!isLocale(raw)) notFound()
  const locale = raw as Locale

  return (
    <main id="main" className="min-h-dvh px-6 py-12" style={{ background: 'var(--bg-committed)' }}>
      <div className="max-w-md md:max-w-2xl mx-auto">
        <AndroidBetaSteps
          t={dictionaries[locale].androidBeta}
          groupUrl={ANDROID_TEST_GROUP_URL}
          optinUrl={ANDROID_TEST_OPTIN_URL}
          webHref={localizedHref('/sign-in', locale)}
        />
      </div>
    </main>
  )
}
