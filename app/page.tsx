import type { Metadata } from 'next'
import { getCurrentUser } from '@/lib/supabase/server'
import { getLocale, getTranslations } from '@/lib/i18n/t'
import { LanguageSwitcher } from '@/lib/i18n/LanguageSwitcher'
import { Landing } from './_landing/Landing'

// Override the layout's `alternates.canonical: '/'` for the public
// landing page — / is now the canonical entry point, not /sign-in.
export const metadata: Metadata = {
  alternates: {
    canonical: '/',
    languages: {
      'zh-TW': '/',
      'zh-CN': '/?lang=zh-CN',
      en: '/?lang=en',
      ja: '/?lang=ja',
    },
  },
}

export default async function RootPage() {
  // Public landing — never redirect. Signed-in viewers get the CTA pointed at
  // /dashboard so they land back in the app in one tap; new viewers get
  // /sign-in. Either way the page renders.
  const [user, t, locale] = await Promise.all([
    getCurrentUser(),
    getTranslations(),
    getLocale(),
  ])

  const ctaHref = user ? '/dashboard' : '/sign-in'

  return (
    <Landing
      t={t.landing}
      ctaHref={ctaHref}
      languageSwitcher={<LanguageSwitcher current={locale} variant="footer" />}
    />
  )
}
