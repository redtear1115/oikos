import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #1376 — every migration that re-schedules `cleanup-soft-deleted` replaces
 * the whole job command. 0017 added the invoice purge; 0021 re-scheduled from
 * 0012's copy and dropped those two lines; 0066 copied 0021. Nothing errored:
 * soft-deleted credentials (and their ciphertext) and year-old import runs
 * were simply never purged.
 *
 * This reads the migrations in journal order and checks that the newest
 * schedule still purges every table any earlier schedule purged. Re-schedule
 * from the highest-numbered owner and it stays green.
 */

const ROOT = join(__dirname, '..')
const JOB = 'cleanup-soft-deleted'

interface Schedule { tag: string; command: string; tables: Set<string> }

function schedules(): Schedule[] {
  const journal = JSON.parse(readFileSync(join(ROOT, 'drizzle/meta/_journal.json'), 'utf8')) as {
    entries: Array<{ tag: string }>
  }
  const out: Schedule[] = []
  const re = new RegExp(`cron\\.schedule\\(\\s*'${JOB}'\\s*,\\s*'[^']*'\\s*,\\s*\\$\\$([\\s\\S]*?)\\$\\$\\s*\\)`, 'g')
  for (const { tag } of journal.entries) {
    const sql = readFileSync(join(ROOT, 'drizzle', `${tag}.sql`), 'utf8')
    for (const m of sql.matchAll(re)) {
      const tables = new Set([...m[1].matchAll(/DELETE FROM "(\w+)"/g)].map((t) => t[1]))
      out.push({ tag, command: m[1], tables })
    }
  }
  return out
}

describe(`${JOB} lineage`, () => {
  const all = schedules()
  const newest = all[all.length - 1]

  it('finds the known re-schedules (guard against the scan matching nothing)', () => {
    expect(all.map((s) => s.tag.slice(0, 4))).toEqual(
      expect.arrayContaining(['0001', '0017', '0021', '0066', '0069']),
    )
  })

  it('the newest schedule purges every table an earlier one purged', () => {
    const missing: string[] = []
    for (const s of all.slice(0, -1)) {
      for (const t of s.tables) if (!newest.tables.has(t)) missing.push(`${t} (purged by ${s.tag})`)
    }
    expect(missing).toEqual([])
  })

  it('invoice retention (#1289): credentials 30 days after soft delete, runs after 1 year', () => {
    expect(newest.command).toMatch(/DELETE FROM "InvoiceCredentials"\s+WHERE deleted_at < NOW\(\) - INTERVAL '30 days';/)
    expect(newest.command).toMatch(/DELETE FROM "InvoiceImportRuns"\s+WHERE started_at < NOW\(\) - INTERVAL '1 year';/)
  })
})
