import type { Locale } from '@/lib/i18n/locales-meta'
import { SCHEMA_LANG } from '@/lib/i18n/seo'
import { Phrase } from '../../_components/Phrase'
import { s } from '../../_components/brand-inner'

type FaqItem = { question: string; answer: string }

export function UseCaseFaq({
  locale,
  heading,
  items,
}: {
  locale: Locale
  heading: string
  items: readonly FaqItem[]
}) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: SCHEMA_LANG[locale],
    mainEntity: items.map(({ question, answer }) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: { '@type': 'Answer', text: answer },
    })),
  }

  return (
    <section className={s.band}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <h2 className={`${s.h2} m-0 text-xl md:text-title font-medium`}>
        <Phrase text={heading} />
      </h2>
      <dl className={s.faq}>
        {items.map(({ question, answer }) => (
          <div key={question}>
            <dt className="text-base font-medium">{question}</dt>
            <dd className="text-sm">{answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
