import type { Locale } from '@/lib/i18n/locales-meta'
import { localizedHref } from '@/lib/i18n/path'
import { SCHEMA_LANG } from '@/lib/i18n/seo'
import type { Translations } from '@/lib/i18n/locales/zh-TW'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://futari.southern-light.dev'
const PATH = '/features/outing'

function Ld({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
}

/**
 * The three JSON-LD blocks of /features/outing (#1633), all per-locale:
 * BreadcrumbList (Home -> this page; there is no /features hub, so no middle
 * node), HowTo (the walkthrough's four steps, anchored #step-N like
 * MigrateHowToJsonLd), and FAQPage (same six questions the page shows).
 */
export function FeatureOutingJsonLd({
  locale,
  t,
  homeName,
}: {
  locale: Locale
  t: Translations['featureOuting']
  homeName: string
}) {
  const pageUrl = `${APP_URL}${localizedHref(PATH, locale)}`
  const inLanguage = SCHEMA_LANG[locale]

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: homeName, item: `${APP_URL}${localizedHref('/', locale)}` },
      { '@type': 'ListItem', position: 2, name: t.breadcrumbLabel, item: pageUrl },
    ],
  }
  const howTo = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    inLanguage,
    name: t.heroTitle,
    description: t.heroSubtitle,
    step: t.steps.map((step, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: t.howToStepName.replace('{n}', String(i + 1)),
      text: `${step.title}: ${step.body}`,
      url: `${pageUrl}#step-${i + 1}`,
    })),
  }
  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage,
    mainEntity: t.faq.map(({ question, answer }) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: { '@type': 'Answer', text: answer },
    })),
  }

  return (
    <>
      <Ld data={breadcrumb} />
      <Ld data={howTo} />
      <Ld data={faq} />
    </>
  )
}
