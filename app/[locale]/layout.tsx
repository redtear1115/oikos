import { notFound } from 'next/navigation'
import { isLocale } from '@/lib/i18n/locales-meta'

// Guards against /foobar matching this dynamic segment. Cookie-based
// translation resolution still happens in each page via getTranslations()
// (which now reads x-locale header set by middleware, see lib/i18n/t.ts).
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  return <>{children}</>
}
