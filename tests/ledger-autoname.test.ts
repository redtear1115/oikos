import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { zhTW } from '@/lib/i18n/locales/zh-TW'

/**
 * #1622 — no ledger name is derived from a person's name.
 *
 * leaveGroup used to name the leaver's new solo ledger "<displayName> 的家計簿".
 * OikosGroups.name is not rewritten by account deletion and can be shown to a
 * later partner, so a deleted person's real name survived. The code now uses
 * the neutral copy key postLeave.newLedgerName, and drizzle/0090 renamed the
 * legacy names to the zh-TW literal.
 *
 * Failure looks like: nothing errors. If the two literals drift, a legacy
 * ledger renamed by 0090 and a new zh-TW leave produce two different
 * "default" names; if someone reintroduces a name template, new ledgers carry
 * real names again and the 0090 invariant (scripts/ops/ledger-autoname-audit-0090.sql)
 * goes non-zero on prod.
 */

const ROOT = join(__dirname, '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
/** SQL with `--` comments removed. */
const code = (sql: string) => sql.replace(/--[^\n]*/g, '')

describe('#1622 ledger auto-name', () => {
  const sql = code(read('drizzle/0090_ledger_autoname.sql'))

  it('0090 renames to exactly the zh-TW neutral default', () => {
    const m = sql.match(/SET\s+name\s*=\s*'([^']*)'/)
    expect(m).not.toBeNull()
    expect(m![1]).toBe(zhTW.postLeave.newLedgerName)
    expect(zhTW.postLeave.newLedgerName).toBe('家計簿')
  })

  it('0090 matches the exact legacy shape leaveGroup produced', () => {
    // `${displayName} 的家計簿` — one ASCII space before 的家計簿.
    expect(sql).toContain("g.name = n.name || ' 的家計簿'")
  })

  it('0090 is data-only: no DDL, no grant, no function', () => {
    expect(sql).not.toMatch(/\b(CREATE|ALTER|DROP|GRANT|REVOKE|TRUNCATE|DELETE)\b/i)
    expect(sql).not.toMatch(/process_account_deletions/)
    // Exactly one statement, an UPDATE of OikosGroups.
    expect(sql.match(/\bUPDATE\b/g)).toHaveLength(1)
    expect(sql).toMatch(/UPDATE\s+"OikosGroups"/)
  })

  it('0090 never selects a name out (no top-level SELECT result)', () => {
    // Every SELECT sits inside the WITH ... UPDATE statement.
    expect(sql.trim().startsWith('WITH')).toBe(true)
    expect(sql.trim().endsWith(';')).toBe(true)
    expect(sql.split(';').filter((s) => s.trim()).length).toBe(1)
  })

  it('no app code builds a ledger name from a display name', () => {
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const p = join(dir, entry)
        if (statSync(p).isDirectory()) { walk(p); continue }
        if (!/\.(ts|tsx)$/.test(entry)) continue
        const rel = relative(ROOT, p)
        if (rel.startsWith(join('lib', 'i18n', 'locales'))) continue
        const text = readFileSync(p, 'utf8')
        // A template or concatenation ending in 的家計簿 is a name-derived ledger name.
        if (/\$\{[^}]*\}\s*的家計簿|\+\s*['"`]\s*的家計簿/.test(text)) offenders.push(rel)
      }
    }
    for (const dir of ['actions', 'lib', 'app', 'components']) walk(join(ROOT, dir))
    expect(offenders).toEqual([])
  })
})
