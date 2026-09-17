import Link from 'next/link'
import type { Locale } from '@/lib/i18n/locales-meta'
import { localizedHref } from '@/lib/i18n/path'
import { USE_CASES, type UseCaseSlug } from '@/lib/use-case/cases'
import type { Translations } from '@/lib/i18n/locales/zh-TW'

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
    <section className="space-y-4">
      <h2
        className="m-0 text-lg font-medium"
        style={{ color: 'var(--ink-2)', letterSpacing: '-0.1px' }}
      >
        {copy.heading}
      </h2>
      <ul className="m-0 list-none p-0 flex flex-wrap gap-3">
        {others.map((slug) => (
          <li key={slug}>
            <Link
              href={localizedHref(`/use-case/${slug}`, locale)}
              // 不放 aria-label：可見的情境名稱本身就是最好的 accessible name。
              // 原本的 "查看 {slug} 頁面" 把路由用的英文 slug 塞進中文句子，
              // 既不是本地化標題，也讓 accessible name 不包含可見文字，
              // 撞上 WCAG 2.5.3 Label in Name（label-content-name-mismatch，#1059）。
              // 與 Landing 的 migrate 卡片同一個解法（#919）。
              className="inline-flex items-center px-4 py-2 rounded-[10px] text-sm"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--hairline)',
                color: 'var(--ink-2)',
                textDecoration: 'none',
              }}
            >
              {names[slug].name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
