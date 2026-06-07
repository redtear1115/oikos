import Link from 'next/link'
import type { Locale } from '@/lib/i18n/locales-meta'
import { localizedHref } from '@/lib/i18n/path'
import { USE_CASES, type UseCaseSlug } from '@/lib/use-case/cases'
import type { Translations } from '@/lib/i18n/locales/zh-TW'

const CASE_TITLES: Record<UseCaseSlug, Record<string, string>> = {
  cohabitation:    { 'zh-TW': '同居 AA 制',  'zh-CN': '同居 AA 制',  en: 'Cohabitation',    ja: '同棲' },
  newlyweds:       { 'zh-TW': '新婚夫妻',    'zh-CN': '新婚夫妻',    en: 'Newlyweds',       ja: '新婚夫婦' },
  'pet-owners':    { 'zh-TW': '寵物家庭',    'zh-CN': '宠物家庭',    en: 'Pet owners',      ja: 'ペット家族' },
  travel:          { 'zh-TW': '旅行分攤',    'zh-CN': '旅行分摊',    en: 'Travel',          ja: '旅行費用' },
  roommates:       { 'zh-TW': '室友分攤',    'zh-CN': '室友分摊',    en: 'Roommates',       ja: 'ルームメイト' },
  'monthly-bills': { 'zh-TW': '每月固定費',  'zh-CN': '每月固定费',  en: 'Monthly bills',   ja: '毎月の固定費' },
  'big-purchases': { 'zh-TW': '大筆支出',    'zh-CN': '大笔支出',    en: 'Big purchases',   ja: '大きな買い物' },
  dining:          { 'zh-TW': '外食費用',    'zh-CN': '外食费用',    en: 'Dining',          ja: '食費・外食' },
  parenting:       { 'zh-TW': '育兒費用',    'zh-CN': '育儿费用',    en: 'Parenting',       ja: '育児費用' },
  'aa-split':      { 'zh-TW': 'AA 制記帳',   'zh-CN': 'AA 制记账',   en: 'AA split',        ja: 'AA 割り勘' },
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
