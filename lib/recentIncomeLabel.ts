import { formatDateRelative } from '@/lib/format-date'
import { getIncomeCategory } from '@/lib/incomeCategories'
import type { Translations } from '@/lib/i18n/locales/zh-TW'

/**
 * The line under the dashboard income hero: 「今天 · 薪資」 (#1362).
 *
 * `todayYMD` must be the viewer's today — `getTodayYMD()` on the server, which
 * reads the device's zone from the `futari_tz` cookie (#1360) — never the
 * server clock. Vercel runs in UTC, so between 00:00 and 08:00 Taipei the
 * server's today is still yesterday.
 *
 * Failure looks like: no error and no hydration warning (this string is built
 * entirely on the server), but for eight hours a day today's income reads as a
 * date and yesterday's as 「今天」, fixing itself by 08:00 Taipei.
 */
export function recentIncomeLabel(
  row: { occurredAt: string; category: string; source: string | null },
  locale: string,
  todayYMD: string,
  incomeCategory: Translations['incomeCategory'],
): string {
  const dateStr = formatDateRelative(row.occurredAt, locale, todayYMD)
  // getIncomeCategory only resolves own keys, so a stray 'constructor' row
  // reads 其他 rather than function source (#1534).
  const catLabel = incomeCategory[getIncomeCategory(row.category).id]
  return `${dateStr} · ${row.source ?? catLabel}`
}
