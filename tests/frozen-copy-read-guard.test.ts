/**
 * #1484 — static guard: every server read that outputs an Assets row's
 * `name` either excludes frozen copies or applies the freeze-time membership
 * rule (`frozenCopyVisibleClause`, lib/db/queries/_predicates.ts).
 *
 * A frozen copy (Assets.frozen_at IS NOT NULL, left by leaveGroup #1442)
 * resolves only for viewers who were members of its ledger at the freeze
 * moment. The rule lives in each query — the app reads as futari_app
 * (BYPASSRLS), so the RLS policy of 0079 does not protect these paths.
 *
 * Failure looks like: nothing at runtime. A new query that selects
 * `assets.name` — or the whole row with a bare `.select()`, or
 * `"Assets".name` / `<alias>.name` in raw SQL — with only a group filter shows
 * a later partner the leaver's car / child name on old records. This test
 * fails first.
 *
 * Granularity: per enclosing function, per Assets reference. A site passes
 * when that function also contains, for the same table reference:
 *   - `isNull(<ref>.frozenAt)` / `<alias>.frozen_at IS NULL` (lists, pickers), or
 *   - `frozenCopyVisibleClause('<sql alias>', …)` (by-id reads, link joins).
 * Anything else must be in ALLOWLIST with its reason.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

const ROOT = join(__dirname, '..')
const SCAN_DIRS = ['actions', 'lib', 'app']

/** file › function → why a name read there cannot surface a frozen copy. */
const ALLOWLIST: Record<string, string> = {
  // INNER JOIN "InsuranceDetails": a frozen copy never has a *Details row
  // (freezeCrossLedgerLinks copies display fields only).
  'lib/db/queries/aibutsu.ts › getLinkedInsurancesForVehicle': 'inner join on InsuranceDetails',
  // The copy writer: reads the source's name to create the copy; returns
  // only counts.
  'lib/db/queries/frozenAssetCopy.ts › freezeCrossLedgerLinks': 'creates copies, outputs no name',
}

interface Site { file: string; line: number; fn: string; ref: string; sqlAlias: string; body: string; row?: true }

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

const FN_START = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)|^(?:export\s+)?const\s+(\w+)\s*=\s*(?:action\()?(?:async\b)?/

/** [start, end) line range of the top-level declaration containing line i. */
function enclosing(lines: string[], i: number): { fn: string; body: string } {
  let start = i
  while (start > 0 && !FN_START.test(lines[start])) start--
  const m = FN_START.exec(lines[start])
  const fn = m ? (m[1] ?? m[2]) : '<top-level>'
  let end = start + 1
  while (end < lines.length && !FN_START.test(lines[end])) end++
  return { fn, body: lines.slice(start, end).join('\n') }
}

function isComment(l: string) {
  return /^\s*(\/\/|\*|\/\*|--)/.test(l)
}

/**
 * Where a bare `.select()` chain ends: the first `;`, or the start of another
 * chain. Without this bound an unrelated `db.select().from(oikosGroups);`
 * would pick up a later `.from(assets)` in the same function.
 */
const CHAIN_END = /;|\.select\(|\bdb\.|\btx\.|\bawait\s/

/** Every place one file reads an Assets row's name (or the whole row), with the SQL alias it renders under. */
function scanSource(file: string, src: string): Site[] {
  const sites: Site[] = []
  const lines = src.split('\n')
  // Drizzle aliases of the Assets table: const x = alias(assets, 'sql_name')
  const aliases = new Map<string, string>([['assets', 'Assets']])
  for (const m of src.matchAll(/const (\w+) = alias\(assets, '(\w+)'\)/g)) aliases.set(m[1], m[2])
  // Raw SQL aliases: "Assets" x
  const rawAliases = new Set<string>()
  for (const m of src.matchAll(/"Assets"\s+(?:AS\s+)?([a-z_]\w*)\b/g)) {
    if (!/^(ON|WHERE|SET|JOIN|LEFT|INNER|USING)$/i.test(m[1])) rawAliases.add(m[1])
  }
  lines.forEach((l, i) => {
    if (isComment(l)) return
    for (const [ref, sqlAlias] of aliases) {
      if (new RegExp(`\\b${ref}\\.name\\b`).test(l)) {
        const { fn, body } = enclosing(lines, i)
        sites.push({ file, line: i + 1, fn, ref, sqlAlias, body })
      }
    }
    for (const al of rawAliases) {
      if (new RegExp(`(?<![\\w.])${al}\\.name\\b`).test(l)) {
        const { fn, body } = enclosing(lines, i)
        if (!/"Assets"/.test(body)) continue
        sites.push({ file, line: i + 1, fn, ref: al, sqlAlias: al, body })
      }
    }
    // Raw SQL without an alias. Only the quoted form: unquoted Assets folds to
    // `assets` in Postgres, and the bare word turns up in prose (JSX comments).
    if (/"Assets"\.name\b/.test(l)) {
      const { fn, body } = enclosing(lines, i)
      sites.push({ file, line: i + 1, fn, ref: '"Assets"', sqlAlias: 'Assets', body })
    }
  })
  // Whole-row reads: a bare `.select()` whose chain — usually spread over
  // several lines — reaches `.from(<ref>)` or `*Join(<ref>`. The row carries
  // `name` without the source ever spelling `<ref>.name`.
  for (const m of src.matchAll(/\.select\(\)/g)) {
    const i = src.slice(0, m.index).split('\n').length - 1
    if (isComment(lines[i])) continue
    const rest = src.slice(m.index + m[0].length)
    const end = rest.search(CHAIN_END)
    const chain = end === -1 ? rest : rest.slice(0, end)
    for (const [ref, sqlAlias] of aliases) {
      if (new RegExp(`(?:\\.from|Join)\\(${ref}\\b`).test(chain)) {
        const { fn, body } = enclosing(lines, i)
        sites.push({ file, line: i + 1, fn, ref, sqlAlias, body, row: true })
      }
    }
  }
  return sites
}

/** Every Assets name / whole-row read in the scanned source tree. */
function nameSites(): Site[] {
  const sites: Site[] = []
  for (const dir of SCAN_DIRS) {
    for (const path of walk(join(ROOT, dir))) {
      sites.push(...scanSource(relative(ROOT, path), readFileSync(path, 'utf8')))
    }
  }
  return sites
}

function guarded(s: Site): boolean {
  const esc = s.ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (new RegExp(`isNull\\(${esc}\\.frozenAt\\)`).test(s.body)) return true
  if (new RegExp(`(?:\\b|")${s.sqlAlias}"?\\.frozen_at IS NULL`).test(s.body)) return true
  return new RegExp(`frozenCopyVisibleClause\\('${s.sqlAlias}',`).test(s.body)
}

describe('frozen-copy read guard (#1484)', () => {
  const sites = nameSites()
  const key = (s: Site) => `${s.file} › ${s.fn}`

  it('finds the known name reads (guard against the scan silently matching nothing)', () => {
    const fns = new Set(sites.map(key))
    for (const k of [
      'lib/db/queries/asset.ts › listAssetsForGroup',
      'lib/db/queries/asset.ts › listFilterAssetsForGroup',
      'lib/db/queries/asset.ts › getAssetById',
      'lib/db/queries/asset.ts › getDrillAssetName',
      'lib/db/queries/aibutsu.ts › getInsuranceDetails',
      'lib/db/queries/aibutsu.ts › getLinkedInsurancesForVehicle',
      'lib/db/queries/transactions.ts › monthlyStatsByAsset',
      'actions/fuelLog.ts › getFuelLogById',
      'actions/income.ts › getInsuranceAssets',
    ]) expect(fns, k).toContain(k)
    // listAssetsForGroup + getAssetById + getInsuranceDetails each read the
    // insured child's name through an alias.
    expect(sites.filter((s) => s.sqlAlias === 'insured_child_asset')).toHaveLength(3)
  })

  it('every name read excludes frozen copies or applies frozenCopyVisibleClause', () => {
    const bad = sites
      .filter((s) => !(key(s) in ALLOWLIST) && !guarded(s))
      .map((s) => `${s.file}:${s.line} (${s.fn}, ${s.ref}${s.row ? ' whole row' : '.name'})`)
    expect(bad).toEqual([])
  })

  it('the allowlist only names functions that still read a name (a rename must not widen it silently)', () => {
    const fns = new Set(sites.map(key))
    for (const k of Object.keys(ALLOWLIST)) expect(fns, k).toContain(k)
  })

  it('self-test: an unguarded by-id read and a mis-aliased clause are caught', () => {
    const body = [
      'export async function leak(id: string, groupId: string, viewerId: string) {',
      '  const [a] = await db.select({ name: assets.name }).from(assets)',
      '    .where(and(eq(assets.id, id), eq(assets.groupId, groupId)))',
      '}',
    ].join('\n')
    expect(guarded({ file: 'x', line: 2, fn: 'leak', ref: 'assets', sqlAlias: 'Assets', body })).toBe(false)
    const wrongAlias = body.replace('eq(assets.groupId, groupId)', "eq(assets.groupId, groupId), frozenCopyVisibleClause('a', viewerId)")
    expect(guarded({ file: 'x', line: 2, fn: 'leak', ref: 'assets', sqlAlias: 'Assets', body: wrongAlias })).toBe(false)
    const ok = body.replace('eq(assets.groupId, groupId)', "eq(assets.groupId, groupId), frozenCopyVisibleClause('Assets', viewerId)")
    expect(guarded({ file: 'x', line: 2, fn: 'leak', ref: 'assets', sqlAlias: 'Assets', body: ok })).toBe(true)
  })
  describe('self-tests: the scanner finds what it should (#1533)', () => {
    const fnOf = (...body: string[]) =>
      ['export async function f(id: string, groupId: string, viewerId: string) {', ...body, '}'].join('\n')
    const scan = (src: string) => scanSource('x.ts', src)
    const unguarded = (src: string) => scan(src).filter((s) => !guarded(s))

    it('a bare select() of the Assets table, on one line', () => {
      const src = fnOf('  const [a] = await db.select().from(assets).where(eq(assets.id, id))')
      expect(unguarded(src)).toHaveLength(1)
      expect(unguarded(src.replace('eq(assets.id, id)', 'and(eq(assets.id, id), isNull(assets.frozenAt))'))).toEqual([])
    })
    it('a bare select() whose .from(assets) is on the next line', () => {
      const src = fnOf('  const [a] = await db', '    .select()', '    .from(assets)', '    .where(eq(assets.id, id))')
      expect(unguarded(src)).toHaveLength(1)
      const ok = src.replace('eq(assets.id, id)', 'and(eq(assets.id, id), isNull(assets.frozenAt))')
      expect(scan(ok)).toHaveLength(1)
      expect(unguarded(ok)).toEqual([])
    })
    it('a bare select() that reaches Assets through a join on a later line', () => {
      const src = fnOf(
        '  return db',
        '    .select()',
        '    .from(fuelLogs)',
        '    .leftJoin(assets, eq(assets.id, fuelLogs.assetId))',
        '    .where(eq(fuelLogs.groupId, groupId))',
      )
      expect(unguarded(src)).toHaveLength(1)
    })
    it('a bare select() of a Drizzle alias of Assets', () => {
      const src = "const kid = alias(assets, 'kid')\n" + fnOf('  return db.select().from(fuelLogs)', '    .innerJoin(kid, eq(kid.id, fuelLogs.assetId))')
      expect(unguarded(src).map((s) => s.sqlAlias)).toEqual(['kid'])
    })
    it('an explicit projection without the name is not a site', () => {
      expect(scan(fnOf('  const [a] = await db', '    .select({ id: assets.id })', '    .from(assets)'))).toEqual([])
    })
    it('a bare select() of another table, ended by `;`, does not reach a later Assets read', () => {
      const src = fnOf(
        '  const [g] = await db.select().from(oikosGroups).where(eq(oikosGroups.id, groupId));',
        '  const rows = db.select({ id: assets.id }).from(assets)',
        '  return { g, rows }',
      )
      expect(scan(src)).toEqual([])
    })
    it('raw SQL reading the quoted "Assets".name, guarded either way', () => {
      const src = fnOf('  return db.execute(sql`SELECT "Assets".name FROM "Assets" WHERE "Assets".id = ${id}`)')
      expect(unguarded(src).map((s) => s.sqlAlias)).toEqual(['Assets'])
      const viaClause = src.replace('= ${id}', "= ${id} AND ${frozenCopyVisibleClause('Assets', viewerId)}")
      expect(unguarded(viaClause)).toEqual([])
      const viaNull = src.replace('= ${id}', '= ${id} AND "Assets".frozen_at IS NULL')
      expect(unguarded(viaNull)).toEqual([])
    })
    it('the word Assets.name in a JSX comment continuation is not a site', () => {
      const src = [
        'export function ChildDetail() {',
        '  return (',
        '      <InfoCard>',
        '        {/* #826 — full real name row. Header above shows the nickname',
        '            (Assets.name). This row decrypts the legal full name on tap. */}',
        '      </InfoCard>',
        '  )',
        '}',
      ].join('\n')
      expect(scan(src)).toEqual([])
    })
  })
})
