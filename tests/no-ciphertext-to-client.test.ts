/**
 * #1466 — static guard: ciphertext of an encrypted column never reaches the
 * browser.
 *
 * Ciphertext is not plaintext, but a copy that lands in an RSC payload, a
 * server-action response or a browser cache is out of reach of key rotation:
 * once an old key leaks, those copies open with it. The only safe shape at the
 * server → client boundary is a presence boolean (`hasAddress`, `hasPlate`, …);
 * plaintext goes out only through the explicit reveal actions.
 *
 * What the pre-#1466 leak looked like: `getHouseDetails` returned
 * `addressEncrypted`, the detail page passed that row whole as `details` to
 * HouseDetailClient, which only ever read Boolean(details?.addressEncrypted).
 * Nothing on screen differed — the ciphertext was visible only in view-source
 * / the RSC payload as a `v1:k…` string.
 *
 * Failure looks like: this test goes red; nothing else does. tsc, the build
 * and every render test stay green when a row with a ciphertext field is
 * handed to a client component.
 *
 * Rules (each one is what the #1466 leak would have tripped, or its sibling):
 *   A. A 'use client' file never names an encrypted property / column.
 *   B. A 'use client' file never imports an exported type whose body declares
 *      an encrypted property (HouseDetailsRow before #1466; AssetWithCar).
 *   C. A server component under app/ reads an encrypted property only as
 *      `Boolean(x.prop)` — anything else is a value that can be passed on.
 *   D. A server action never returns an encrypted property: `return` lines
 *      don't mention one (except `return decrypt(…)`, the reveal path),
 *      `.returning({…})` doesn't select one, and a bare `.returning()` is not
 *      used on a table that has one.
 *
 * The behavioural half (the real page data path, walked for `v1:k…` strings)
 * is tests/asset-detail-page-no-ciphertext-1466.test.tsx.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { ENCRYPTED_COLUMNS } from '@/lib/crypto'

const ROOT = join(__dirname, '..')

const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())

/** `name_encrypted` → `nameEncrypted`, for every registered column. */
const ENCRYPTED_PROPS: string[] = Object.values(ENCRYPTED_COLUMNS).flat().map(camel)
const COLUMN_NAMES: string[] = Object.values(ENCRYPTED_COLUMNS).flat()
/** Drizzle table identifiers for tables that hold an encrypted column. */
const ENCRYPTED_TABLE_IDENTS = Object.keys(ENCRYPTED_COLUMNS).map((t) => t[0].toLowerCase() + t.slice(1))

const PROP_RE = new RegExp(`\\b(${ENCRYPTED_PROPS.join('|')})\\b`)
const COLUMN_RE = new RegExp(`\\b(${COLUMN_NAMES.join('|')})\\b`)

function sourceFiles(dir: string): string[] {
  if (!existsSync(join(ROOT, dir))) return []
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = join(dir, e.name)
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : sourceFiles(rel)
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [rel] : []
  })
}

const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

/** First statement is the 'use client' directive (comments allowed above it). */
function isClientFile(src: string): boolean {
  const body = src.replace(/^\s*(\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*/, '')
  return /^['"]use client['"]/.test(body)
}

/** Strip comments so prose that names a column ("Assets.name_encrypted IS
 *  NOT NULL on the server") doesn't count as a use. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
}

const APP_DIRS = ['app', 'components', 'lib', 'actions']
const allFiles = APP_DIRS.flatMap(sourceFiles)
const clientFiles = allFiles.filter((f) => isClientFile(read(f)))

// ── Checkers (exported shape kept local; the self-tests below feed them
//    synthetic sources so a rule that silently stops matching goes red). ──

function ruleA(src: string): string[] {
  const code = stripComments(src)
  return code.split('\n').filter((l) => PROP_RE.test(l) || COLUMN_RE.test(l))
}

/** Exported interface / type names whose body declares an encrypted prop. */
function ciphertextTypes(files: string[]): Set<string> {
  const out = new Set<string>()
  for (const f of files) {
    const code = stripComments(read(f))
    const re = /export\s+(?:interface\s+(\w+)[^{]*\{|type\s+(\w+)\s*=\s*\{)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(code))) {
      // Walk braces to the end of the body.
      let depth = 1
      let i = re.lastIndex
      while (i < code.length && depth > 0) {
        if (code[i] === '{') depth++
        else if (code[i] === '}') depth--
        i++
      }
      const body = code.slice(re.lastIndex, i)
      if (new RegExp(`\\b(${ENCRYPTED_PROPS.join('|')})\\??\\s*:`).test(body)) out.add(m[1] ?? m[2])
    }
  }
  return out
}

function ruleB(src: string, banned: Set<string>): string[] {
  const hits: string[] = []
  const re = /import\s+(?:type\s+)?\{([^}]*)\}\s*from/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    for (const raw of m[1].split(',')) {
      const name = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]
      if (name && banned.has(name)) hits.push(name)
    }
  }
  return hits
}

function ruleC(src: string): string[] {
  const code = stripComments(src)
  const hits: string[] = []
  for (const line of code.split('\n')) {
    const re = new RegExp(`(\\w+(?:\\?\\.|\\.)\\s*)?\\b(${ENCRYPTED_PROPS.join('|')})\\b`, 'g')
    let m: RegExpExecArray | null
    while ((m = re.exec(line))) {
      const start = m.index
      const before = line.slice(0, start)
      const after = line.slice(start + m[0].length)
      const wrapped = /Boolean\(\s*$/.test(before) && /^\s*\)/.test(after)
      if (!wrapped) hits.push(line.trim())
    }
  }
  return hits
}

function ruleD(src: string): string[] {
  const code = stripComments(src)
  const lines = code.split('\n')
  const hits: string[] = []
  lines.forEach((line, i) => {
    const ret = line.match(/\breturn\b(.*)$/)
    if (ret && !/^\s*decrypt\(/.test(ret[1])) {
      // A `return {` / `return (` spanning lines: take the whole bracketed
      // expression, not just the first line.
      let expr = ret[1]
      let depth = (expr.match(/[{(\[]/g) ?? []).length - (expr.match(/[})\]]/g) ?? []).length
      for (let j = i + 1; depth > 0 && j < lines.length; j++) {
        expr += '\n' + lines[j]
        depth += (lines[j].match(/[{(\[]/g) ?? []).length - (lines[j].match(/[})\]]/g) ?? []).length
      }
      if (PROP_RE.test(expr)) hits.push(`return: ${line.trim()}`)
    }
    const returning = line.match(/\.returning\(\s*\{([^}]*)\}?/)
    if (returning && PROP_RE.test(returning[1])) hits.push(`returning: ${line.trim()}`)
    if (/\.returning\(\s*\)/.test(line)) {
      // Nearest preceding insert/update target.
      for (let j = i; j >= Math.max(0, i - 30); j--) {
        const t = lines[j].match(/\.(?:insert|update)\(\s*(\w+)\s*\)/)
        if (t) {
          if (ENCRYPTED_TABLE_IDENTS.includes(t[1])) hits.push(`bare returning on ${t[1]}: ${line.trim()}`)
          break
        }
      }
    }
  })
  return hits
}

// ── The guard ───────────────────────────────────────────────────────────────

describe('#1466 — no ciphertext crosses the server → client boundary', () => {
  it('finds the files it is meant to scan (the scan is not vacuous)', () => {
    expect(ENCRYPTED_PROPS).toEqual(expect.arrayContaining(['addressEncrypted', 'nameEncrypted', 'plateEncrypted']))
    expect(clientFiles).toContain(join('app', '(dashboard)', 'assets', '[id]', '_components', 'HouseDetailClient.tsx'))
    expect(clientFiles.length).toBeGreaterThan(50)
  })

  it('A: no client component names an encrypted property or column', () => {
    const hits = clientFiles.flatMap((f) => ruleA(read(f)).map((l) => `${f}: ${l.trim()}`))
    expect(hits).toEqual([])
  })

  it('B: no client component imports a type that carries a ciphertext field', () => {
    const banned = ciphertextTypes(allFiles.filter((f) => !isClientFile(read(f))))
    // AssetWithCar is the known carrier; if it stops being detected the scan broke.
    expect(banned.has('AssetWithCar')).toBe(true)
    const hits = clientFiles.flatMap((f) => ruleB(read(f), banned).map((n) => `${f}: imports ${n}`))
    expect(hits).toEqual([])
  })

  it('C: server components read encrypted properties only as Boolean(…)', () => {
    // Pages, layouts and route handlers (e.g. app/api/export) alike.
    const serverApp = sourceFiles('app').filter((f) => !isClientFile(read(f)))
    const hits = serverApp.flatMap((f) => ruleC(read(f)).map((l) => `${f}: ${l}`))
    expect(hits).toEqual([])
  })

  it('D: server actions never return an encrypted property', () => {
    const hits = sourceFiles('actions').flatMap((f) => ruleD(read(f)).map((l) => `${f}: ${l}`))
    expect(hits).toEqual([])
  })
})

// ── Self-tests: each rule catches the shape it exists for ───────────────────

describe('#1466 guard self-tests', () => {
  it('A catches the pre-#1466 HouseDetailClient line, ignores comments', () => {
    expect(ruleA(`'use client'\nconst hasAddress = Boolean(details?.addressEncrypted)`)).toHaveLength(1)
    expect(ruleA(`'use client'\n// Assets.name_encrypted IS NOT NULL on the server\nconst x = 1`)).toEqual([])
  })

  it('B flags importing a ciphertext-carrying type by name, with alias or `type`', () => {
    const banned = new Set(['HouseDetailsRow'])
    expect(ruleB(`import type { HouseDetailsRow } from '@/lib/db/queries/aibutsu'`, banned)).toEqual(['HouseDetailsRow'])
    expect(ruleB(`import { type HouseDetailsRow as R, getX } from 'm'`, banned)).toEqual(['HouseDetailsRow'])
    expect(ruleB(`import type { PetDetailsRow } from 'm'`, banned)).toEqual([])
  })

  it('C allows Boolean(x.prop) and flags a raw read', () => {
    expect(ruleC(`houseHasAddress: Boolean(houseDetailsData?.addressEncrypted),`)).toEqual([])
    expect(ruleC(`hasPlate={Boolean(asset.plateEncrypted)}`)).toEqual([])
    expect(ruleC(`plate={asset.plateEncrypted}`)).toHaveLength(1)
    expect(ruleC(`const { nameEncrypted } = asset`)).toHaveLength(1)
  })

  it('D flags returned ciphertext, allows return decrypt(…)', () => {
    expect(ruleD(`  return decrypt(row.addressEncrypted, aadFor('HouseDetails', 'address_encrypted', id))`)).toEqual([])
    expect(ruleD(`  return { id, plateEncrypted: row.plateEncrypted }`)).toHaveLength(1)
    expect(ruleD(`  return {\n    id: row.id,\n    addressEncrypted: row.addressEncrypted,\n  }`)).toHaveLength(1)
    expect(ruleD(`  return {\n    id: row.id,\n  }\n  const other = { addressEncrypted: null }`)).toEqual([])
    expect(ruleD(`    .returning({ id: assets.id, nameEncrypted: assets.nameEncrypted })`)).toHaveLength(1)
    expect(ruleD(`  const r = await db\n    .update(houseDetails)\n    .set({ owner })\n    .returning()`)).toHaveLength(1)
    expect(ruleD(`  const r = await db\n    .update(trips)\n    .set({ name })\n    .returning()`)).toEqual([])
  })

  it('the type scan detects an exported interface with an encrypted field', () => {
    // Sanity on a real file rather than a fixture: HouseDetailsRow must be
    // clean after #1466, AssetWithCar still carries ciphertext (server-only).
    const types = ciphertextTypes([join('lib', 'db', 'queries', 'aibutsu.ts'), join('lib', 'db', 'queries', 'asset.ts')])
    expect(types.has('HouseDetailsRow')).toBe(false)
    expect(types.has('AssetWithCar')).toBe(true)
  })
})
