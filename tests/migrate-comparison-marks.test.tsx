import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MIGRATE_SOURCES, resolveComparisonRows } from '@/lib/migrate/sources'
import { MigrateComparison } from '@/app/[locale]/migrate/_components/MigrateComparison'
import { zhTW } from '@/lib/i18n/locales/zh-TW'
import { en } from '@/lib/i18n/locales/en'
import { zhCN } from '@/lib/i18n/locales/zh-CN'
import { ja } from '@/lib/i18n/locales/ja'

// #1519: MigrateComparison owns the ✓ / △ / ✕ mark. A label that also carries
// one rendered as "✓ ✓ 支援". Silent: build and types pass, only the table shows it.
const LOCALES = { zhTW, en, zhCN, ja } as const
const MARK = /[✓✕△◐—]/g

describe('migrate comparison cells show exactly one mark (#1519)', () => {
  for (const [slug, source] of Object.entries(MIGRATE_SOURCES)) {
    for (const [localeKey, locale] of Object.entries(LOCALES)) {
      it(`${slug} / ${localeKey}`, () => {
        const rows = resolveComparisonRows(source.comparison.rows, locale.migrate.comparisonText)
        const { container, unmount } = render(
          <MigrateComparison heading="h" futariLabel="a" otherLabel="b" rows={rows} />,
        )
        const cells = container.querySelectorAll('tbody td')
        expect(cells.length).toBe(rows.length * 2)
        cells.forEach((td) => {
          const text = td.textContent ?? ''
          expect(text.match(MARK)?.length, `cell "${text}"`).toBe(1)
          expect(text.trim()).toMatch(/^[✓✕△]/)
        })
        unmount()
      })
    }
  }
})
