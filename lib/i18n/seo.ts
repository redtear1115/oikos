import type { Metadata } from 'next'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from './locales-meta'
import { localizedHref } from './path'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://futari.southern-light.dev'

/**
 * Per-page canonical + hreflang language map for phase-1 public pages.
 * `path` is the unlocalized path: '/', '/sign-in', '/terms', '/privacy'.
 */
export function buildAlternates(path: string, currentLocale: Locale): Metadata['alternates'] {
  const languages: Record<string, string> = {}
  for (const locale of SUPPORTED_LOCALES) {
    languages[locale] = `${APP_URL}${localizedHref(path, locale)}`
  }
  languages['x-default'] = `${APP_URL}${localizedHref(path, DEFAULT_LOCALE)}`
  return {
    canonical: `${APP_URL}${localizedHref(path, currentLocale)}`,
    languages,
  }
}

/** BCP-47 language tags for use in JSON-LD `inLanguage`. */
export const SCHEMA_LANG: Record<Locale, string> = {
  'zh-TW': 'zh-TW',
  'zh-CN': 'zh-CN',
  en: 'en',
  ja: 'ja',
}

const OG_LOCALES: Record<Locale, string> = {
  'zh-TW': 'zh_TW',
  'zh-CN': 'zh_CN',
  en: 'en_US',
  ja: 'ja_JP',
}

export function ogLocale(locale: Locale): string {
  return OG_LOCALES[locale]
}

export function alternateOgLocales(currentLocale: Locale): string[] {
  return SUPPORTED_LOCALES.filter(l => l !== currentLocale).map(ogLocale)
}

const LOCALE_OG_IMAGES: Partial<Record<Locale, string>> = {
  en: '/og-image-en.png',
  ja: '/og-image-ja.png',
}

export function ogImage(locale: Locale): string {
  return LOCALE_OG_IMAGES[locale] ?? '/og-image.png'
}
