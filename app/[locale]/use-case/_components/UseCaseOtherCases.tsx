import Link from 'next/link'
import type { Locale } from '@/lib/i18n/locales-meta'
import { localizedHref } from '@/lib/i18n/path'
import { USE_CASES, type UseCaseSlug } from '@/lib/use-case/cases'
import type { Translations } from '@/lib/i18n/locales/zh-TW'
import { Phrase } from '../../_components/Phrase'
import { Ember } from '../../_components/Ember'
import { s } from '../../_components/brand-inner'

export function UseCaseOtherCases({
  locale,
  currentSlug,
  copy,
  names,
}: {
  locale: Locale
  currentSlug: UseCaseSlug
  copy: Translations['useCase']['otherCases']
  /** `useCase.hub.items` — the same names the hub cards and the breadcrumb
   *  JSON-LD use, so a situation has one name per locale (#1188). */
  names: Translations['useCase']['hub']['items']
}) {
  const others = (Object.keys(USE_CASES) as UseCaseSlug[]).filter((s) => s !== currentSlug)

  return (
    <section className={s.band}>
      <h2 className={`${s.h2} m-0 text-lg font-medium`}>
        <Phrase text={copy.heading} />
      </h2>
      <ul className={s.pills}>
        {others.map((slug) => (
          <li key={slug}>
            <Link
              href={localizedHref(`/use-case/${slug}`, locale)}
              // 不放 aria-label：可見的情境名稱本身就是最好的 accessible name
              // （label-content-name-mismatch，#1059；與 Landing 的 migrate 卡片同解，#919）。
              className={`${s.pill} text-sm`}
            >
              <Ember />
              {names[slug].name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
