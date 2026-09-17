/**
 * Copy for `app/global-error.tsx` (#1275).
 *
 * Why this lives outside `lib/i18n/locales/*.ts` rather than pulling from
 * `getTranslations()` like every other page: `global-error.tsx` replaces the
 * ROOT layout when it fires (it renders its own `<html>`/`<body>`), so
 * `TranslationsProvider` — which every `useTranslations()` call in the
 * dashboard depends on — never mounts. And per the Next.js docs, a
 * global-error boundary can only catch errors thrown *inside* the root
 * layout by being a Client Component with no server-side data fetching of
 * its own, so it can't `await getTranslations()` either. There is no context
 * to read from and nothing to await from — the locale has to be picked
 * client-side, from a cookie or the browser, with a small self-contained
 * copy table.
 *
 * Do NOT import the full locale files here (`zh-TW.ts` etc.) to pull just
 * these four keys — those modules are large (thousands of lines) and pull in
 * types/data meant for the normal `getTranslations()` path. What that looks
 * like when it goes wrong: nothing breaks visibly, tsc is green, tests pass —
 * the global error page just ships a much heavier client bundle than a page
 * whose entire job is "something already went wrong, stay light."
 */
import { LOCALE_COOKIE, SUPPORTED_LOCALES, DEFAULT_LOCALE, type Locale } from './locales-meta'

export interface GlobalErrorCopy {
  title: string
  body: string
  retry: string
  home: string
}

export const globalErrorCopy: Record<Locale, GlobalErrorCopy> = {
  'zh-TW': {
    title: '剛才出了點狀況',
    body: '再試一次通常就好了。',
    retry: '再試一次',
    home: '回首頁',
  },
  'zh-CN': {
    title: '刚才出了点状况',
    body: '再试一次通常就好了。',
    retry: '再试一次',
    home: '回首页',
  },
  en: {
    title: 'Something hiccupped',
    body: 'Trying again usually fixes it.',
    retry: 'Try again',
    home: 'Back home',
  },
  ja: {
    title: '少し問題が起きました',
    body: 'もう一度試すとたいてい直ります。',
    retry: 'もう一度試す',
    home: 'ホームに戻る',
  },
}

/** Best-effort map from a `navigator.language` tag to a supported locale.
 *  Falls back to `DEFAULT_LOCALE` for anything unrecognized — this only
 *  needs to be roughly right, the page is a handful of words. */
function localeFromNavigatorLanguage(language: string | undefined): Locale {
  if (!language) return DEFAULT_LOCALE
  const lower = language.toLowerCase()
  if (lower.startsWith('zh')) {
    return lower.includes('cn') || lower.includes('hans') ? 'zh-CN' : 'zh-TW'
  }
  if (lower.startsWith('ja')) return 'ja'
  if (lower.startsWith('en')) return 'en'
  return DEFAULT_LOCALE
}

function localeFromCookieHeader(cookieHeader: string | undefined): Locale | null {
  if (!cookieHeader) return null
  // Cheap manual parse — pulling in a cookie library for one key is not
  // worth it, and `document.cookie` never contains characters that need
  // more than a plain split (LanguageSwitcher.tsx writes it the same way).
  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=')
    if (rawName === LOCALE_COOKIE) {
      const value = rawValue.join('=')
      if ((SUPPORTED_LOCALES as readonly string[]).includes(value)) return value as Locale
    }
  }
  return null
}

/**
 * Picks a locale for the global error page. Client-only (reads
 * `document.cookie` / `navigator.language`), so callers must guard SSR —
 * see `app/global-error.tsx` for how the initial render avoids a hydration
 * mismatch.
 */
export function pickGlobalErrorLocale(
  cookieHeader: string | undefined = typeof document !== 'undefined' ? document.cookie : undefined,
  navigatorLanguage: string | undefined = typeof navigator !== 'undefined' ? navigator.language : undefined,
): Locale {
  return localeFromCookieHeader(cookieHeader) ?? localeFromNavigatorLanguage(navigatorLanguage)
}
