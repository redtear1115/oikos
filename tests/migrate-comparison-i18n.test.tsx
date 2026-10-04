import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MIGRATE_SOURCES, resolveComparisonRows } from '@/lib/migrate/sources'
import { MigrateComparison } from '@/app/[locale]/migrate/_components/MigrateComparison'
import { zhTW } from '@/lib/i18n/locales/zh-TW'
import { en } from '@/lib/i18n/locales/en'
import { zhCN } from '@/lib/i18n/locales/zh-CN'
import { ja } from '@/lib/i18n/locales/ja'

// #1538: every string in the comparison table is a locale string. The failure
// this guards is silent: a Chinese literal in lib/migrate/sources.ts builds,
// type-checks and passes i18n parity, and only shows up as 支援 / 無 / 多種模式
// inside an otherwise English or Japanese /migrate/<source> page.

const HAN = /\p{Script=Han}/u
// Characters that exist only in Traditional script. A zh-CN cell containing one
// is a zh-TW string that was copied instead of written.
const TRADITIONAL_ONLY = /[資帳單費幣訂購無種備較對據選線連雲換獨時說設應預進階與權會員運動舊隨記計匯導試內兩發週級帶體訊僅視]/

// 限定 is ordinary Japanese (limited-edition / members-only), so these two are
// genuinely the same string in ja and zh-TW; same idea as the ja-i18n skill's
// kanji whitelist (.claude/skills/ja-i18n/references/kanji-whitelist.md).
const JA_SHARED = new Set(['VIP 限定', 'Premium 限定'])

function renderTable(locale: typeof zhTW, rows: ReturnType<typeof resolveComparisonRows>) {
  const { container } = render(
    <MigrateComparison heading="h" futariLabel="Futari" otherLabel="Other" rows={rows} />,
  )
  const cells = [...container.querySelectorAll('tbody th, tbody td')].map((e) => (e.textContent ?? '').replace(/^[✓△✕]\s*/, '').trim())
  return { container, cells, rowCount: container.querySelectorAll('tbody tr').length }
}

describe('migrate comparison table is fully translated (#1538)', () => {
  for (const [slug, source] of Object.entries(MIGRATE_SOURCES)) {
    const zhRows = resolveComparisonRows(source.comparison.rows, zhTW.migrate.comparisonText)
    const zh = renderTable(zhTW, zhRows)
    const zhCnRows = resolveComparisonRows(source.comparison.rows, zhCN.migrate.comparisonText)

    it(`${slug} / en has no Han characters in any row header or cell`, () => {
      const t = renderTable(en, resolveComparisonRows(source.comparison.rows, en.migrate.comparisonText))
      expect(t.rowCount).toBe(zh.rowCount)
      for (const c of t.cells) {
        expect(c, 'empty or missing key').toMatch(/\S/)
        expect(c).not.toBe('undefined')
        expect(c, `cell "${c}"`).not.toMatch(HAN)
      }
    })

    it(`${slug} / zh-CN has no Traditional-only characters`, () => {
      const t = renderTable(zhCN, zhCnRows)
      expect(t.rowCount).toBe(zh.rowCount)
      for (const c of t.cells) {
        expect(c).not.toBe('undefined')
        expect(c, `cell "${c}"`).not.toMatch(TRADITIONAL_ONLY)
      }
    })

    it(`${slug} / ja is written for ja, not copied from zh-TW or zh-CN`, () => {
      const t = renderTable(ja, resolveComparisonRows(source.comparison.rows, ja.migrate.comparisonText))
      expect(t.rowCount).toBe(zh.rowCount)
      t.cells.forEach((c, i) => {
        expect(c).not.toBe('undefined')
        // Latin-only text (iOS／Android／Web) is legitimately identical.
        if (!HAN.test(zh.cells[i]) || JA_SHARED.has(c)) return
        expect(c, `ja cell ${i} equals zh-TW`).not.toBe(zh.cells[i])
        expect(c, `ja cell ${i} equals zh-CN`).not.toBe(renderTable(zhCN, zhCnRows).cells[i])
      })
    })
  }

  it('every comparisonText key has a non-empty value in all four locales', () => {
    for (const l of [zhTW, en, zhCN, ja]) {
      for (const [k, v] of Object.entries(l.migrate.comparisonText)) {
        expect(v, k).toMatch(/\S/)
      }
    }
  })
})
