import type { Locale } from '@/lib/i18n/locales-meta'
import { SCHEMA_LANG } from '@/lib/i18n/seo'

type FaqItem = { question: string; answer: string }

/**
 * FAQ section + matching FAQPage JSON-LD for the /migrate/<source> landing
 * pages (#599). Emits per-locale schema so each URL's rich-result language
 * matches its rendered content — unlike the homepage which only emits zh-TW.
 */
export function MigrateFaq({
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
    <section className="space-y-5">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <h2
        className="text-label m-0"
        style={{
          fontFamily: 'var(--font-fraunces)',
          color: 'var(--ink-2)',
          letterSpacing: '3.5px',
          textTransform: 'uppercase',
        }}
      >
        {heading}
      </h2>
      <dl className="m-0 space-y-3">
        {items.map(({ question, answer }) => (
          <div
            key={question}
            className="rounded-[16px] px-5 md:px-6 py-4 md:py-5"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--hairline)',
            }}
          >
            <dt
              className="m-0 text-body md:text-[15.5px] font-medium"
              style={{ color: 'var(--ink)', letterSpacing: '-0.2px' }}
            >
              {question}
            </dt>
            <dd
              className="m-0 mt-2 text-label md:text-meta leading-[1.7]"
              style={{ color: 'var(--ink-2)' }}
            >
              {answer}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
