import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

// ─── #1288 I3c — nothing references the plaintext `GroupInvites.token` ────
//
// I3c stops writing the plaintext invite token and stops reading it. The next
// step (I3d) drops the column. Any build that still names it breaks the
// moment that migration runs: a Drizzle schema that declares `token` makes
// every `db.select().from(groupInvites)` select it, so preview and accept
// fail with "column does not exist" and every invite link reads as broken.
//
// This is also gate G2's evidence ("a grep at the deployed commit shows no
// `token` column reference in schema.ts, actions/ or __tests__/").
//
// Failure looks like: this test names the file and the line. Comments are
// ignored (they don't run); `token_hash` / `tokenHash` are fine.
// ──────────────────────────────────────────────────────────────────────────

const root = resolve(__dirname, '..')
const SELF = relative(root, __filename)

const SCAN_DIRS = ['actions', 'lib', 'app', 'components', '__tests__', 'tests']
const EXT = /\.(ts|tsx|js|mjs|cjs|sql)$/

function walk(dir: string, out: string[] = []): string[] {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of names) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (EXT.test(name)) out.push(p)
  }
  return out
}

/** Blank out comments, keeping line numbers. Good enough for this repo's style. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, (_m, pre: string) => pre)
    .replace(/^\s*--.*$/gm, '')
}

// Each pattern is a way code could name the plaintext column of GroupInvites.
// Applied only to files that mention the table (other tables, PushTokens for
// one, have a legitimate `token` column); the schema's own GroupInvites block
// is checked separately above.
const touchesTable = (src: string) => /\bgroupInvites\b|"GroupInvites"/.test(src)
const PATTERNS: Array<[string, RegExp]> = [
  ['Drizzle column access groupInvites.token', /\bgroupInvites\.token\b/],
  ['raw INSERT column list naming token', /"GroupInvites"\s*\([^)]*\btoken\b(?!_hash)/],
  ['raw UPDATE … SET token', /\bSET\s+token\s*=/i],
  ['raw predicate on token', /\b(?:WHERE|AND|OR)\s+(?:\w+\.)?token\s*(?:=|IS\b)/i],
  ['hashing the token column (the 0070 backfill)', /convert_to\(\s*token\b/],
]

describe('no reference to the plaintext GroupInvites.token column (#1288 I3c, gate G2)', () => {
  const files = SCAN_DIRS.flatMap((d) => walk(join(root, d))).filter((f) => relative(root, f) !== SELF)

  it('scans the runtime code and the tests that touch the table', () => {
    const touching = files
      .filter((f) => touchesTable(stripComments(readFileSync(f, 'utf8'))))
      .map((f) => relative(root, f))
    expect(touching).toContain('actions/invite.ts')
    expect(touching).toContain('actions/membership.ts')
    expect(touching).toContain('__tests__/actions/invite.tokenHash.test.ts')
    expect(touching.length).toBeGreaterThan(10)
  })

  it('the Drizzle groupInvites table declares no token column', () => {
    const schema = readFileSync(join(root, 'lib/db/schema.ts'), 'utf8')
    const start = schema.indexOf("pgTable('GroupInvites'")
    expect(start).toBeGreaterThan(-1)
    const block = stripComments(schema.slice(start, schema.indexOf('\n}))', start)))
    expect(block).not.toMatch(/['"]token['"]/)
    expect(block).not.toMatch(/^\s*token\s*:/m)
    expect(block).toMatch(/tokenHash:\s*text\('token_hash'\)/)
  })

  it('no file names the column', () => {
    const hits: string[] = []
    for (const f of files) {
      const src = stripComments(readFileSync(f, 'utf8'))
      if (!touchesTable(src)) continue
      const lines = src.split('\n')
      lines.forEach((line, i) => {
        for (const [label, re] of PATTERNS) {
          if (re.test(line)) hits.push(`${relative(root, f)}:${i + 1} ${label}`)
        }
      })
    }
    expect(hits).toEqual([])
  })
})
