// Regression guard for #1505 (follow-up to #501 / #1494).
//
// Every function in schema `public` must end up with a pinned `search_path`
// (Supabase advisor "Function Search Path Mutable"; also hardens SECURITY
// DEFINER functions against search_path hijack). The pin is easy to lose
// silently: `CREATE OR REPLACE FUNCTION` without a `SET search_path` header
// option resets the function's config. 0061 redefined
// compute_monthly_review_snapshot and undid the pin 0042 had added with ALTER
// FUNCTION; nothing failed, the advisor warning just came back (fixed by 0077
// / #1494).
//
// Rule, per function: look at its LAST `CREATE [OR REPLACE] FUNCTION` in
// drizzle/*.sql (filename order). It passes if that header carries
// `SET search_path`, or a LATER `ALTER FUNCTION <name>(...) SET search_path`
// exists (0016 + 0042 for compute_next_occurrence).
//
// Static, no DB. Known limits: functions are matched by name, not by argument
// list (no overloads exist in public); a CREATE FUNCTION inside a DO / EXECUTE
// string is not seen; functions not created by a migration (rls_auto_enable is
// Supabase-provided) are out of scope; a function in another schema
// (`auth.foo`) is ignored. db/triggers/handle_new_user.sql is deliberately not
// scanned: it is the pre-migration bootstrap, not part of the migration
// history (0022 pins handle_new_user on top of it).
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

interface SqlFile {
  file: string
  sql: string
}

/**
 * Blank out everything that can hide or fake a statement: `--` and nested
 * block comments, single-quoted strings, and dollar-quoted bodies (`$$`,
 * `$tag$`). Dollar delimiters themselves are kept so the header/body boundary
 * stays findable. Length is preserved, so offsets still order statements.
 */
function maskSql(sql: string): string {
  const out = sql.split('')
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' '
  }
  let i = 0
  while (i < sql.length) {
    const c = sql[i]
    const n = sql[i + 1]
    if (c === '-' && n === '-') {
      let j = i
      while (j < sql.length && sql[j] !== '\n') j++
      blank(i, j)
      i = j
    } else if (c === '/' && n === '*') {
      let depth = 1
      let j = i + 2
      while (j < sql.length && depth > 0) {
        if (sql[j] === '/' && sql[j + 1] === '*') {
          depth++
          j += 2
        } else if (sql[j] === '*' && sql[j + 1] === '/') {
          depth--
          j += 2
        } else j++
      }
      blank(i, j)
      i = j
    } else if (c === "'") {
      let j = i + 1
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") j += 2
        else if (sql[j] === "'") break
        else j++
      }
      blank(i + 1, j)
      i = j + 1
    } else if (c === '$') {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i))
      if (!m) {
        i++
        continue
      }
      const close = sql.indexOf(m[0], i + m[0].length)
      const end = close === -1 ? sql.length : close
      blank(i + m[0].length, end)
      i = close === -1 ? sql.length : close + m[0].length
    } else {
      i++
    }
  }
  return out.join('')
}

// `auth.foo(` does not match: after the optional `public.` the name must be
// followed directly by `(`.
const NAME = String.raw`(?:public\s*\.\s*)?"?([A-Za-z_][A-Za-z0-9_]*)"?`
const CREATE_RE = new RegExp(
  String.raw`\bcreate\s+(?:or\s+replace\s+)?function\s+${NAME}\s*\(`,
  'gi',
)
const ALTER_RE = new RegExp(
  String.raw`\balter\s+function\s+${NAME}\s*\([^)]*\)\s*set\s+search_path\b`,
  'gi',
)
const SET_PIN_RE = /\bset\s+search_path\b/i

interface Pos {
  fileIdx: number
  offset: number
}
const after = (a: Pos, b: Pos) =>
  a.fileIdx > b.fileIdx || (a.fileIdx === b.fileIdx && a.offset > b.offset)

interface Violation {
  fn: string
  file: string
}

function findUnpinnedFunctions(files: SqlFile[]): Violation[] {
  const sorted = [...files].sort((a, b) => a.file.localeCompare(b.file))
  const lastCreate = new Map<string, Pos & { file: string; pinned: boolean }>()
  const alters = new Map<string, Pos[]>()

  sorted.forEach(({ file, sql }, fileIdx) => {
    const masked = maskSql(sql)
    for (const m of masked.matchAll(CREATE_RE)) {
      const sigEnd = m.index! + m[0].length
      // Header = everything up to the body opener (`AS $...$` or `AS '`).
      const bodyAt = masked.slice(sigEnd).search(/\bas\s+(?:\$|')/i)
      const header = masked.slice(sigEnd, bodyAt === -1 ? undefined : sigEnd + bodyAt)
      lastCreate.set(m[1], {
        fileIdx,
        offset: m.index!,
        file,
        pinned: SET_PIN_RE.test(header),
      })
    }
    for (const m of masked.matchAll(ALTER_RE)) {
      const list = alters.get(m[1]) ?? []
      list.push({ fileIdx, offset: m.index! })
      alters.set(m[1], list)
    }
  })

  const bad: Violation[] = []
  for (const [fn, def] of lastCreate) {
    if (def.pinned) continue
    if ((alters.get(fn) ?? []).some((a) => after(a, def))) continue
    bad.push({ fn, file: def.file })
  }
  return bad
}

function formatViolations(v: Violation[]): string {
  return v
    .map(
      (x) =>
        `public.${x.fn}: last defined in ${x.file} without SET search_path, and no later ALTER FUNCTION pins it. ` +
        `CREATE OR REPLACE FUNCTION without SET search_path silently resets the pin ` +
        `(0061 undid 0042 for compute_monthly_review_snapshot; fixed by 0077, #1494). ` +
        `Add "SET search_path = public, pg_temp" to the function header.`,
    )
    .join('\n')
}

// MIGRATIONS_DIR lets a negative-control run point at a mutated temp copy.
const DRIZZLE_DIR = process.env.MIGRATIONS_DIR ?? join(process.cwd(), 'drizzle')
function loadMigrations(): SqlFile[] {
  return readdirSync(DRIZZLE_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((file) => ({ file, sql: readFileSync(join(DRIZZLE_DIR, file), 'utf8') }))
}

describe('public function search_path pin (#1505)', () => {
  const migrations = loadMigrations()

  it('every public function ends with a pinned search_path', () => {
    expect(formatViolations(findUnpinnedFunctions(migrations))).toBe('')
  })

  it('actually sees the expected functions (parser sanity)', () => {
    const names = new Set<string>()
    for (const { sql } of migrations)
      for (const m of maskSql(sql).matchAll(CREATE_RE)) names.add(m[1])
    for (const fn of [
      '_delete_group_cascade',
      'compute_monthly_review_snapshot',
      'compute_next_occurrence',
      'process_account_deletions',
      'profile_is_live',
    ])
      expect(names).toContain(fn)
  })

  // Negative controls on the real migrations, mutated in memory.
  // #1618: 0089 is now the latest CREATE OR REPLACE of this function, so the
  // negative control mutates 0089 (a mutated 0077 is superseded by 0089).
  it('fails when 0089 loses its SET line (0061 regression shape)', () => {
    const mutated = migrations.map((f) =>
      f.file.startsWith('0089_')
        ? { ...f, sql: f.sql.replace(/^SET search_path = public, pg_temp\n/m, '') }
        : f,
    )
    expect(mutated).not.toEqual(migrations)
    const bad = findUnpinnedFunctions(mutated)
    expect(bad.map((b) => b.fn)).toEqual(['compute_monthly_review_snapshot'])
    expect(bad[0].file).toMatch(/^0089_/)
    expect(formatViolations(bad)).toContain('0061 undid 0042')
  })

  it('fails when 0042 loses its compute_next_occurrence ALTER', () => {
    const mutated = migrations.map((f) =>
      f.file.startsWith('0042_')
        ? {
            ...f,
            sql: f.sql.replace(/ALTER FUNCTION public\.compute_next_occurrence[^;]*;/, ''),
          }
        : f,
    )
    expect(mutated).not.toEqual(migrations)
    const bad = findUnpinnedFunctions(mutated)
    expect(bad.map((b) => b.fn)).toEqual(['compute_next_occurrence'])
    expect(bad[0].file).toMatch(/^0016_/)
  })

  // Parser edge cases.
  it('handles dollar tags, comments, multi-line signatures and option order', () => {
    expect(
      findUnpinnedFunctions([
        {
          file: '0001.sql',
          sql: `-- CREATE FUNCTION commented_out() SET search_path
/* CREATE FUNCTION also_commented() */
CREATE OR REPLACE FUNCTION
  public.f1(
    a int,
    b text
  )
RETURNS void
SECURITY DEFINER
set   search_path = public
LANGUAGE plpgsql
AS $body$ BEGIN PERFORM 1; END; $body$;`,
        },
      ]),
    ).toEqual([])

    // "SET search_path" only inside the body or a string must not count.
    expect(
      findUnpinnedFunctions([
        {
          file: '0001.sql',
          sql: `create function f2() returns void language plpgsql as $$
BEGIN
  -- SET search_path = x
  EXECUTE 'SET search_path = x';
END; $$;`,
        },
      ]),
    ).toEqual([{ fn: 'f2', file: '0001.sql' }])
  })

  it('a later ALTER rescues, an earlier ALTER does not', () => {
    const create = `CREATE FUNCTION f3() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;`
    const alter = `ALTER FUNCTION public.f3() SET search_path = public, pg_temp;`
    expect(
      findUnpinnedFunctions([
        { file: '0001.sql', sql: create },
        { file: '0002.sql', sql: alter },
      ]),
    ).toEqual([])
    expect(
      findUnpinnedFunctions([
        { file: '0001.sql', sql: alter },
        { file: '0002.sql', sql: create },
      ]),
    ).toEqual([{ fn: 'f3', file: '0002.sql' }])
  })
})
