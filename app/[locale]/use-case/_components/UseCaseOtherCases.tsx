import Link from 'next/link'
import type { Locale } from '@/lib/i18n/locales-meta'
import { localizedHref } from '@/lib/i18n/path'
import { USE_CASES, type UseCaseSlug } from '@/lib/use-case/cases'
import type { Translations } from '@/lib/i18n/locales/zh-TW'

const CASE_TITLES: Record<UseCaseSlug, Record<string, string>> = {
  cohabitation: { 'zh-TW': '同居 AA 制', 'zh-CN': '同居 AA 制', en: 'Cohabitation', ja: '同棲' },
  newlyweds:    { 'zh-TW': '新婚夫妻',   'zh-CN': '新婚夫妻',   en: 'Newlyweds',    ja: '新婚夫婦' },
  'pet-owners': { 'zh-TW': '寵物家庭',   'zh-CN': '宠物家庭',   en: 'Pet owners',   ja: 'ペット家族' },
}

export function UseCaseOtherCases({
  locale,
  currentSlug,
  copy,
}: {
  locale: Locale
  currentSlug: UseCaseSlug
  copy: Translations['useCase']['otherCases']
}) {
  const others = (Object.keys(USE_CASES) as UseCaseSlug[]).filter((s) => s !== currentSlug)

  return (
    <section className="space-y-4">
      <h2
        className="m-0 text-[18px] font-medium"
        style={{ color: 'var(--ink-2)', letterSpacing: '-0.1px' }}
      >
        {copy.heading}
      </h2>
      <ul className="m-0 list-none p-0 flex flex-wrap gap-3">
        {others.map((slug) => (
          <li key={slug}>
            <Link
              href={localizedHref(`/use-case/${slug}`, locale)}
              aria-label={copy.cardAriaLabel.replace('{slug}', slug)}
              className="inline-flex items-center px-4 py-2 rounded-[10px] text-sm"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--hairline)',
                color: 'var(--ink-2)',
                textDecoration: 'none',
              }}
            >
              {CASE_TITLES[slug][locale] ?? CASE_TITLES[slug]['zh-TW']}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
