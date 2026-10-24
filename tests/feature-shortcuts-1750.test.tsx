/**
 * #1750 - /features/shortcuts, the public iPhone Shortcuts guide.
 *
 * What failure looks like: nothing errors. A guide whose example URL the parser
 * no longer accepts still renders and sends people to a blank "記一筆"; a LINE
 * Pay block leaking into en/ja/zh-CN just reads as a stray section.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToString } from 'react-dom/server'

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('notFound') } }))

import FeatureShortcutsPage from '@/app/[locale]/features/shortcuts/page'
import { appUrl, webUrl, CATEGORY_IDS } from '@/app/[locale]/features/shortcuts/_components/urls'
import sitemap from '@/app/sitemap'
import { parseQuickAddSchemeUrl, parseQuickAddHash } from '@/lib/quickAdd'
import { SUPPORTED_LOCALES, type Locale } from '@/lib/i18n/locales-meta'
import { dictionaries } from '@/lib/i18n/t'
import { localizedHref } from '@/lib/i18n/path'
import { PICKABLE_CATEGORIES } from '@/lib/categories'

async function renderPage(locale: Locale) {
  const html = renderToString(await FeatureShortcutsPage({ params: Promise.resolve({ locale }) }))
  return { html, doc: new DOMParser().parseFromString(html, 'text/html') }
}

describe.each(SUPPORTED_LOCALES)('%s', (locale) => {
  const t = dictionaries[locale].featureShortcuts

  it('renders the answer, Apple Pay steps, params, when-not and troubleshooting', async () => {
    const { doc } = await renderPage(locale)
    for (const id of ['answer', 'apple-pay', 'web', 'params', 'when-not', 'trouble']) {
      expect(doc.getElementById(id), id).not.toBeNull()
    }
    expect(doc.querySelectorAll('#apple-pay ol > li')).toHaveLength(t.applePay.steps.length)
    expect(doc.getElementById('answer')!.textContent).toContain(t.answer)
  })

  it('shows the LINE Pay section only in zh-TW', async () => {
    const { doc } = await renderPage(locale)
    expect(doc.getElementById('line-pay') !== null).toBe(locale === 'zh-TW')
    expect(t.linePay.heading !== '').toBe(locale === 'zh-TW')
  })

  it('the example URLs on the page parse to the expected prefill', async () => {
    const { doc } = await renderPage(locale)
    const codes = [...doc.querySelectorAll('pre')].map((el) => el.textContent ?? '')
    const app = appUrl(t.vars.amount, t.vars.merchant)
    const web = webUrl(t.vars.amount, t.vars.merchant)
    expect(codes).toContain(app)
    expect(codes).toContain(web)
    // Fill the variable markers the way the Shortcut would.
    const fill = (u: string) => u.replace(`[${t.vars.amount}]`, '120').replace(`[${t.vars.merchant}]`, 'Cafe')
    // #1822 — removed `category` from the examples; merchant memory takes over.
    // When no category is passed, the parser returns only amount + description.
    expect(parseQuickAddSchemeUrl(fill(app))).toEqual({ amount: 120, description: 'Cafe' })
    const hash = fill(web).slice(fill(web).indexOf('#'))
    expect(parseQuickAddHash(hash)).toEqual({ amount: 120, description: 'Cafe' })
  })

  it('lists exactly the categories the parser accepts, with the app\'s own names', async () => {
    expect([...CATEGORY_IDS].sort()).toEqual(PICKABLE_CATEGORIES.map((c) => c.id).sort())
    const { doc } = await renderPage(locale)
    const rows = [...doc.querySelectorAll('#params tbody tr')].map((tr) => tr.textContent ?? '')
    for (const id of CATEGORY_IDS) {
      expect(rows.some((r) => r.startsWith(id) && r.includes(dictionaries[locale].category[id]))).toBe(true)
    }
  })

  it('keeps the trust claim: no auto-logging / binding wording, no exclamation marks', () => {
    // #1751: the SEO strings and the settings row are user-facing copy of the same page.
    const all = JSON.stringify([t, dictionaries[locale].seo.featureShortcuts, dictionaries[locale].settings.shortcutsGuide])
    expect(all).not.toMatch(/自動記帳|自动记账|綁定|绑定|串接|[!！]|加密|encrypt|暗号化/i)
    expect(all).not.toMatch(/管理|追蹤|追踪|監控|监控/)
    // The iOS shell opens this page (Apple 2.3.10): never name another platform.
    expect(all).not.toMatch(/android/i)
  })

  it('emits breadcrumb and HowTo JSON-LD for the Apple Pay steps', async () => {
    const { doc } = await renderPage(locale)
    const blocks = [...doc.querySelectorAll('script[type="application/ld+json"]')].map((el) =>
      JSON.parse(el.textContent ?? '{}'),
    )
    expect(blocks.map((b) => b['@type'])).toEqual(['BreadcrumbList', 'HowTo'])
    expect(blocks[1].step).toHaveLength(t.applePay.steps.length)
  })
})

describe('sitemap', () => {
  it('lists /features/shortcuts in all four locales', () => {
    const urls = new Set(sitemap().map((e) => e.url))
    for (const locale of SUPPORTED_LOCALES) {
      expect(urls.has(`http://localhost:3000${localizedHref('/features/shortcuts', locale)}`)).toBe(true)
    }
  })
})
