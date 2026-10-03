import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #1518 — new tables and functions must not reopen the Data API.
 *
 * On Supabase every table, sequence and function the `postgres` role creates
 * in `public` gets ALL for `anon` and `authenticated` from the default ACL.
 * 0080 took those grants away from every existing table; a migration after it
 * that creates a table or function without revoking them silently puts a new
 * GET /rest/v1/<table> (or /rpc/<fn>) back in every signed-in browser's reach
 * — RLS then decides alone, and a ledger-membership policy lets a later
 * partner read earlier chapters. Nothing errors when this happens.
 *
 * So, for every migration numbered after 0080:
 *   - each CREATE TABLE / VIEW / FUNCTION has a REVOKE … FROM anon and from
 *     authenticated on that object in the same file (or REVOKE … ON ALL
 *     TABLES / FUNCTIONS IN SCHEMA public), unless it is on ALLOWED below with
 *     a reason; a function also needs FROM PUBLIC — EXECUTE is granted to
 *     PUBLIC by default, and anon reaches it through PUBLIC even after a
 *     revoke from anon itself (#1533);
 *   - and, from 0080 on, nothing is GRANTed to anon.
 * A grant to authenticated after the revoke is fine (that is how a table
 * Realtime needs gets exactly its columns) — the live catalog test
 * (__tests__/actions/dataApiGrants1518.test.ts) checks the result.
 */

const ROOT = join(__dirname, '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

/** Objects a later migration may create without revoking anon / authenticated, with the reason. */
const ALLOWED: Record<string, string> = {}

const GUARD_FROM = 80 // 0080 itself is the baseline; checked from 0081 on

/** SQL with `--` comments removed, so a comment can't satisfy or trip a check. */
const code = (sql: string) => sql.replace(/--[^\n]*/g, '')

/**
 * Top-level statements. A `;` inside a dollar-quoted body ($$ … $$, $fn$ … $fn$)
 * does not end the statement: with a plain split, a REVOKE written inside a
 * plpgsql body would read as a top-level REVOKE and satisfy the check (#1533).
 * `$1` / `$2` parameters are not delimiters (a tag starts with a letter or _).
 */
function splitStatements(sql: string): string[] {
  const out: string[] = []
  let start = 0
  let tag: string | null = null // the open dollar quote, if any
  for (let i = 0; i < sql.length; i++) {
    if (sql[i] === '$') {
      const m = /^\$(?:[A-Za-z_]\w*)?\$/.exec(sql.slice(i))
      if (!m) continue
      if (tag === null) tag = m[0]
      else if (m[0] === tag) tag = null
      i += m[0].length - 1
    } else if (sql[i] === ';' && tag === null) {
      out.push(sql.slice(start, i))
      start = i + 1
    }
  }
  out.push(sql.slice(start))
  return out.map((x) => x.trim()).filter(Boolean)
}

const bare = (name: string) => name.replace(/"/g, '').replace(/^public\./i, '').toLowerCase()

function grantViolations(sql: string): string[] {
  const statements = splitStatements(code(sql))
  const created: { name: string; kind: '*table' | '*function' }[] = []
  const revoked = new Map<string, Set<string>>() // object (or '*table' / '*function') → roles
  const out: string[] = []
  const note = (obj: string, roles: string[]) => {
    const set = revoked.get(obj) ?? new Set<string>()
    for (const r of roles) set.add(r)
    revoked.set(obj, set)
  }
  for (const s of statements) {
    const table = /^CREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?((?:"?\w+"?\.)?"?\w+"?)/i.exec(s)
    if (table) created.push({ name: bare(table[1]), kind: '*table' })
    // A view answers GET /rest/v1/<view> exactly like a table.
    const view = /^CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?((?:"?\w+"?\.)?"?\w+"?)/i.exec(s)
    if (view) created.push({ name: bare(view[1]), kind: '*table' })
    const fn = /^CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+((?:"?\w+"?\.)?"?\w+"?)\s*\(/i.exec(s)
    if (fn) created.push({ name: bare(fn[1]), kind: '*function' })

    const rev = /^REVOKE\b([\s\S]*?)\bON\b([\s\S]*?)\bFROM\b([\s\S]*)$/i.exec(s)
    if (rev) {
      const roles = ['PUBLIC', 'anon', 'authenticated'].filter((r) => new RegExp(`\\b${r}\\b`, 'i').test(rev[3]))
      const objects = rev[2]
      if (/ALL\s+TABLES\s+IN\s+SCHEMA\s+public/i.test(objects)) note('*table', roles)
      else if (/ALL\s+FUNCTIONS\s+IN\s+SCHEMA\s+public/i.test(objects)) note('*function', roles)
      else if (/^\s*FUNCTION\b/i.test(objects)) {
        for (const m of objects.matchAll(/((?:"?\w+"?\.)?"?\w+"?)\s*\(/g)) note(bare(m[1]), roles)
      } else {
        for (const part of objects.replace(/^\s*TABLE\b/i, '').split(',')) {
          const name = part.trim().split(/\s+/)[0]
          if (name) note(bare(name), roles)
        }
      }
    }
    if (/\bGRANT\b[\s\S]*\bTO\b[\s\S]*\banon\b/i.test(s) && !/^REVOKE\b/i.test(s)) {
      out.push(`grants to anon: ${s.replace(/\s+/g, ' ').slice(0, 120)}`)
    }
  }
  for (const { name: obj, kind } of created) {
    if (ALLOWED[obj]) continue
    const roles = new Set([...(revoked.get(obj) ?? []), ...(revoked.get(kind) ?? [])])
    for (const r of kind === '*function' ? ['PUBLIC', 'anon', 'authenticated'] : ['anon', 'authenticated']) {
      if (!roles.has(r)) out.push(`${obj}: created without REVOKE … FROM ${r}`)
    }
  }
  return out
}

const journal = JSON.parse(read('drizzle/meta/_journal.json')) as { entries: { idx: number; when: number; tag: string }[] }

describe('migration grant guard (#1518)', () => {
  it('0080 is in the journal after 0079, with a strictly greater `when`', () => {
    const e79 = journal.entries.find((e) => e.tag === '0079_frozen_copy_visibility')
    const e80 = journal.entries.find((e) => e.tag === '0080_chapter_scoped_rls')
    expect(e79 && e80).toBeTruthy()
    expect(e80!.idx).toBe(80)
    expect(e80!.when).toBeGreaterThan(e79!.when)
    expect(Math.max(...journal.entries.filter((e) => e.idx < 80).map((e) => e.when))).toBeLessThan(e80!.when)
  })

  it('every migration after 0080 revokes anon / authenticated on what it creates, and none grants to anon', () => {
    const files = readdirSync(join(ROOT, 'drizzle')).filter((f) => /^\d{4}_.*\.sql$/.test(f))
    const failures: string[] = []
    for (const f of files) {
      const n = Number(f.slice(0, 4))
      if (n < GUARD_FROM) continue
      const v = grantViolations(read(`drizzle/${f}`))
      const relevant = n === GUARD_FROM ? v.filter((x) => x.startsWith('grants to anon')) : v
      for (const x of relevant) failures.push(`${f}: ${x}`)
    }
    expect(failures).toEqual([])
  })

  it('0080 itself revokes anon on every table and never grants to anon', () => {
    const sql = code(read('drizzle/0080_chapter_scoped_rls.sql'))
    expect(sql).toMatch(/REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;/)
    expect(grantViolations(read('drizzle/0080_chapter_scoped_rls.sql'))).toEqual([])
  })

  describe('negative controls: the checker flags what it should', () => {
    it('a table created without any revoke', () => {
      expect(grantViolations('CREATE TABLE "Foo" (id uuid);')).toEqual([
        'foo: created without REVOKE … FROM anon',
        'foo: created without REVOKE … FROM authenticated',
      ])
    })
    it('a revoke from one role only, or only in a comment', () => {
      expect(grantViolations('CREATE TABLE "Foo" (id uuid);\nREVOKE ALL ON TABLE "Foo" FROM anon;')).toEqual([
        'foo: created without REVOKE … FROM authenticated',
      ])
      expect(grantViolations('CREATE TABLE "Foo" (id uuid);\n-- REVOKE ALL ON TABLE "Foo" FROM anon, authenticated;')).toHaveLength(2)
    })
    it('a function without a revoke, and a grant to anon', () => {
      expect(grantViolations('CREATE OR REPLACE FUNCTION public.f(x int) RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;')).toHaveLength(3)
      expect(grantViolations('GRANT SELECT ON "Foo" TO anon, authenticated;')).toHaveLength(1)
    })
    it('a function revoked from anon and authenticated but not PUBLIC (#1533)', () => {
      expect(grantViolations(`
        CREATE OR REPLACE FUNCTION public.f(x int) RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;
        REVOKE ALL ON FUNCTION public.f(int) FROM anon, authenticated;`)).toEqual([
        'f: created without REVOKE … FROM PUBLIC',
      ])
    })
    it('a REVOKE inside a dollar-quoted body is not a top-level revoke (#1533)', () => {
      expect(grantViolations(`
        CREATE OR REPLACE FUNCTION public.f() RETURNS void LANGUAGE plpgsql AS $fn$
        BEGIN
          PERFORM 1;
          REVOKE ALL ON FUNCTION public.f() FROM PUBLIC, anon, authenticated;
        END
        $fn$;`)).toEqual([
        'f: created without REVOKE … FROM PUBLIC',
        'f: created without REVOKE … FROM anon',
        'f: created without REVOKE … FROM authenticated',
      ])
    })
    it('a GRANT to anon inside a body, and a top-level one after a body (#1533)', () => {
      const fn = `
        CREATE OR REPLACE FUNCTION public.f(p uuid) RETURNS void LANGUAGE plpgsql AS $$
        BEGIN
          PERFORM 1 WHERE $1 IS NOT NULL;
          EXECUTE 'GRANT SELECT ON "Foo" TO anon';
        END
        $$;
        REVOKE ALL ON FUNCTION public.f(uuid) FROM PUBLIC, anon, authenticated;`
      const inBody = grantViolations(fn)
      expect(inBody).toHaveLength(1)
      expect(inBody[0]).toMatch(/^grants to anon: CREATE OR REPLACE FUNCTION public\.f/)
      const after = grantViolations(fn.replace("EXECUTE 'GRANT SELECT ON \"Foo\" TO anon';", '') + '\nGRANT SELECT ON "Foo" TO anon;')
      expect(after).toEqual(['grants to anon: GRANT SELECT ON "Foo" TO anon'])
      expect(grantViolations('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;')).toHaveLength(1)
    })
    it('a view created without a revoke (#1533)', () => {
      expect(grantViolations('CREATE OR REPLACE VIEW public."FooView" AS SELECT 1;')).toEqual([
        'fooview: created without REVOKE … FROM anon',
        'fooview: created without REVOKE … FROM authenticated',
      ])
      expect(grantViolations('CREATE MATERIALIZED VIEW IF NOT EXISTS "FooView" AS SELECT 1;')).toHaveLength(2)
      expect(grantViolations('CREATE VIEW "FooView" AS SELECT 1;\nREVOKE ALL ON "FooView" FROM anon, authenticated;')).toEqual([])
      expect(grantViolations('CREATE VIEW "FooView" AS SELECT 1;\nREVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;')).toEqual([])
    })
    it('passes the intended shapes', () => {
      expect(grantViolations(`
        CREATE TABLE IF NOT EXISTS "Foo" (id uuid);
        REVOKE ALL ON TABLE "Bar", "Foo" FROM anon, authenticated;
        GRANT SELECT ("id") ON TABLE "Foo" TO authenticated;
        CREATE OR REPLACE FUNCTION public.f(x int) RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;
        REVOKE ALL ON FUNCTION public.f(int) FROM PUBLIC, anon, authenticated, service_role;
        GRANT EXECUTE ON FUNCTION public.f(int) TO authenticated;`)).toEqual([])
      expect(grantViolations('CREATE TABLE "Foo" (id uuid);\nREVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;')).toEqual([])
      // A plpgsql body with inner `;` and its own REVOKE (no GRANT), revoked properly at top level.
      expect(grantViolations(`
        CREATE OR REPLACE FUNCTION public.g(p uuid) RETURNS void LANGUAGE plpgsql AS $body$
        BEGIN
          DELETE FROM "Foo" WHERE id = $1;
          REVOKE ALL ON TABLE "Foo" FROM anon;
        END
        $body$;
        REVOKE ALL ON FUNCTION public.g(uuid) FROM PUBLIC, anon, authenticated;`)).toEqual([])
    })
  })
})
