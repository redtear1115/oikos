import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { aadFor, decrypt, encrypt } from '@/lib/crypto'
import {
  COLUMN_TARGETS,
  PROJECT_REFS,
  GuardError,
  assertEnvFileOutsideRepo,
  assertNoAmbientKeys,
  assertTargetMatchesUrl,
  exitCodeFor,
  formatResult,
  main,
  parseArgs,
  reencrypt,
  repoRoots,
  type ColumnTarget,
  type Db,
} from '../scripts/reencrypt-pii.ts'

// Test keys only. Never real key material.
const K1 = '0000000000000000000000000000000000000000000000000000000000000001'
const K2 = 'aa'.repeat(32)

const SCRIPT_DIR = resolve(__dirname, '../scripts')
const DEV_URL = `postgresql://postgres:pw@db.${PROJECT_REFS.dev}.supabase.co:5432/postgres`
const PROD_POOLER_URL = `postgresql://postgres.${PROJECT_REFS.prod}:pw@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`

function setKeyEnv(env: { key?: string; keys?: string; writeKid?: string }) {
  vi.stubEnv('ENCRYPTION_KEY', env.key ?? '')
  vi.stubEnv('ENCRYPTION_KEYS', env.keys ?? '')
  vi.stubEnv('ENCRYPTION_WRITE_KID', env.writeKid ?? '')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

const keyOf = (t: ColumnTarget) => `${t.table}.${t.column}`
const ctxFor = (t: ColumnTarget, pk: string) => aadFor(t.table, t.column as never, pk)

/** In-memory DB with real compare-and-swap semantics and a hook to simulate concurrent edits. */
class FakeDb implements Db {
  data = new Map<string, Map<string, string>>()
  casCalls = 0
  beforeCas: ((t: ColumnTarget, pk: string) => void) | null = null

  set(t: ColumnTarget, pk: string, ct: string) {
    if (!this.data.has(keyOf(t))) this.data.set(keyOf(t), new Map())
    this.data.get(keyOf(t))!.set(pk, ct)
  }
  get(t: ColumnTarget, pk: string) {
    return this.data.get(keyOf(t))?.get(pk)
  }
  async selectColumn(t: ColumnTarget) {
    return [...(this.data.get(keyOf(t)) ?? new Map()).entries()].map(([pk, ct]) => ({ pk, ct }))
  }
  async compareAndSwap(t: ColumnTarget, pk: string, prev: string, next: string) {
    this.casCalls++
    this.beforeCas?.(t, pk)
    const col = this.data.get(keyOf(t))
    if (!col || col.get(pk) !== prev) return 0
    col.set(pk, next)
    return 1
  }
}

/** One legacy row per encrypted column (6), plaintext derived from the column. */
function seedLegacy(db: FakeDb) {
  setKeyEnv({ key: K1 }) // no write kid → encrypt() writes the legacy format
  const plain = new Map<string, string>()
  COLUMN_TARGETS.forEach((t, i) => {
    const pk = `00000000-0000-4000-8000-00000000000${i}`
    const value = `plain-${t.column}-${i}`
    const ct = encrypt(value, ctxFor(t, pk))
    expect(ct.split(':')).toHaveLength(3)
    db.set(t, pk, ct)
    plain.set(`${keyOf(t)}|${pk}`, value)
  })
  return plain
}

describe('reencrypt-pii — targets', () => {
  it('covers all six encrypted columns with the pk the app binds into the AAD', () => {
    expect(COLUMN_TARGETS.map((t) => `${t.table}.${t.column}:${t.pk}`)).toEqual([
      'Assets.name_encrypted:id',
      'CarDetails.plate_encrypted:asset_id',
      'HouseDetails.address_encrypted:asset_id',
      'ChildDetails.id_number_encrypted:asset_id',
      'ChildDetails.insurance_id_encrypted:asset_id',
      'InvoiceCredentials.verification_code_encrypted:id',
    ])
  })

  it('selects soft-deleted rows too (no deleted_at filter)', () => {
    const src = readFileSync(join(SCRIPT_DIR, 'reencrypt-pii.ts'), 'utf8')
    expect(src).not.toMatch(/deleted_at/)
  })

  it('the real UPDATE is a compare-and-swap on the old ciphertext (the mocked DB cannot see the SQL)', () => {
    const src = readFileSync(join(SCRIPT_DIR, 'reencrypt-pii.ts'), 'utf8')
    const update = /UPDATE \$\{sql\(t\.table\)\}[\s\S]*?`/.exec(src)?.[0] ?? ''
    expect(update).toMatch(/WHERE \$\{sql\(t\.pk\)\}::text = \$\{pk\} AND \$\{sql\(t\.column\)\} = \$\{prev\}/)
  })

  it('does not re-implement the cipher (#881): no node:crypto cipher calls in the script', () => {
    const src = readFileSync(join(SCRIPT_DIR, 'reencrypt-pii.ts'), 'utf8')
    expect(src).not.toMatch(/createCipheriv|createDecipheriv|aes-256-gcm/)
    expect(src).toMatch(/from '\.\.\/lib\/crypto\.ts'/)
  })
})

describe('reencrypt-pii — apply', () => {
  it('legacy → v1:<writeKid>, decrypting to the same plaintext under the correct AAD only', async () => {
    const db = new FakeDb()
    const plain = seedLegacy(db)
    setKeyEnv({ key: K1, writeKid: 'k1' })

    const r = await reencrypt(db, { apply: true, writeKid: 'k1' })
    expect(r.aborted).toBeNull()
    expect(r.columns.map((c) => c.rewritten)).toEqual([1, 1, 1, 1, 1, 1])
    expect(exitCodeFor(r)).toBe(0)

    for (const t of COLUMN_TARGETS) {
      for (const [pk, ct] of db.data.get(keyOf(t))!) {
        expect(ct.startsWith('v1:k1:')).toBe(true)
        expect(decrypt(ct, ctxFor(t, pk))).toBe(plain.get(`${keyOf(t)}|${pk}`))
        // Bound to its own row: another pk in the same column must not open it.
        expect(() => decrypt(ct, ctxFor(t, 'ffffffff-0000-4000-8000-000000000000'))).toThrow()
      }
    }
    // Bound to its own column: the two ChildDetails columns share a pk but not an AAD.
    const idNum = COLUMN_TARGETS.find((t) => t.column === 'id_number_encrypted')!
    const ins = COLUMN_TARGETS.find((t) => t.column === 'insurance_id_encrypted')!
    const [[pk, ct]] = [...db.data.get(keyOf(idNum))!]
    expect(() => decrypt(ct, ctxFor(ins, pk))).toThrow()
  })

  it('a second run rewrites 0 rows and issues no writes', async () => {
    const db = new FakeDb()
    seedLegacy(db)
    setKeyEnv({ key: K1, writeKid: 'k1' })
    await reencrypt(db, { apply: true, writeKid: 'k1' })
    const snapshot = JSON.stringify([...db.data].map(([k, m]) => [k, [...m]]))
    const writesBefore = db.casCalls

    const second = await reencrypt(db, { apply: true, writeKid: 'k1' })
    expect(second.columns.every((c) => c.toRewrite === 0 && c.rewritten === 0)).toBe(true)
    expect(second.columns.map((c) => c.current)).toEqual([1, 1, 1, 1, 1, 1])
    expect(db.casCalls).toBe(writesBefore)
    expect(JSON.stringify([...db.data].map(([k, m]) => [k, [...m]]))).toBe(snapshot)
  })

  it('rotates v1:k1 rows to v1:k2 when the write kid moves', async () => {
    const db = new FakeDb()
    const plain = seedLegacy(db)
    setKeyEnv({ key: K1, writeKid: 'k1' })
    await reencrypt(db, { apply: true, writeKid: 'k1' })

    setKeyEnv({ key: K1, keys: `k2:${K2}`, writeKid: 'k2' })
    const r = await reencrypt(db, { apply: true, writeKid: 'k2' })
    expect(r.columns.map((c) => c.rewritten)).toEqual([1, 1, 1, 1, 1, 1])
    for (const t of COLUMN_TARGETS) {
      for (const [pk, ct] of db.data.get(keyOf(t))!) {
        expect(ct.startsWith('v1:k2:')).toBe(true)
        expect(decrypt(ct, ctxFor(t, pk))).toBe(plain.get(`${keyOf(t)}|${pk}`))
      }
    }
  })

  it('a row changed mid-run is not clobbered: counted as raced, picked up by the next run', async () => {
    const db = new FakeDb()
    seedLegacy(db)
    setKeyEnv({ key: K1, writeKid: 'k1' })
    const plate = COLUMN_TARGETS.find((t) => t.column === 'plate_encrypted')!
    const [platePk] = [...db.data.get(keyOf(plate))!.keys()]
    // The app edits the plate after preflight read it, before our write lands.
    const concurrent = encrypt('edited-by-app', ctxFor(plate, platePk))
    db.beforeCas = (t, pk) => {
      if (t === plate && pk === platePk) {
        db.set(plate, platePk, concurrent)
        db.beforeCas = null
      }
    }

    const r = await reencrypt(db, { apply: true, writeKid: 'k1' })
    const plateCounts = r.columns.find((c) => c.label === 'CarDetails.plate_encrypted')!
    expect(plateCounts).toMatchObject({ rewritten: 0, raced: 1, failed: 0 })
    expect(db.get(plate, platePk)).toBe(concurrent) // the app's value survives
    expect(exitCodeFor(r)).toBe(3)
    expect(formatResult('dev', r)).toContain('raced=1')

    const again = await reencrypt(db, { apply: true, writeKid: 'k1' })
    expect(again.columns.every((c) => c.raced === 0 && c.toRewrite === 0)).toBe(true)
    expect(decrypt(db.get(plate, platePk)!, ctxFor(plate, platePk))).toBe('edited-by-app')
  })

  it('a row hard-deleted mid-run counts as raced, not failed', async () => {
    const db = new FakeDb()
    seedLegacy(db)
    setKeyEnv({ key: K1, writeKid: 'k1' })
    const house = COLUMN_TARGETS.find((t) => t.table === 'HouseDetails')!
    db.beforeCas = (t, pk) => {
      if (t === house) db.data.get(keyOf(house))!.delete(pk)
    }
    const r = await reencrypt(db, { apply: true, writeKid: 'k1' })
    expect(r.columns.find((c) => c.label === 'HouseDetails.address_encrypted')).toMatchObject({ raced: 1, failed: 0 })
  })
})

describe('reencrypt-pii — guards that must write nothing', () => {
  it('without --apply (dry-run) nothing is written', async () => {
    const db = new FakeDb()
    seedLegacy(db)
    setKeyEnv({ key: K1, writeKid: 'k1' })
    const before = JSON.stringify([...db.data].map(([k, m]) => [k, [...m]]))
    const r = await reencrypt(db, { apply: false, writeKid: 'k1' })
    expect(r.mode).toBe('dry-run')
    expect(r.columns.map((c) => c.toRewrite)).toEqual([1, 1, 1, 1, 1, 1])
    expect(db.casCalls).toBe(0)
    expect(JSON.stringify([...db.data].map(([k, m]) => [k, [...m]]))).toBe(before)
  })

  it('preflight failure on any row aborts before the first write', async () => {
    const db = new FakeDb()
    seedLegacy(db)
    // Last column (InvoiceCredentials) holds a value that does not decrypt, so
    // every earlier column has already been read as rewritable when it fails.
    const last = COLUMN_TARGETS[COLUMN_TARGETS.length - 1]
    setKeyEnv({ key: 'cd'.repeat(32) })
    db.set(last, '00000000-0000-4000-8000-0000000000ff', encrypt('wrong key', ctxFor(last, '00000000-0000-4000-8000-0000000000ff')))
    setKeyEnv({ key: K1, writeKid: 'k1' })
    const before = JSON.stringify([...db.data].map(([k, m]) => [k, [...m]]))

    const r = await reencrypt(db, { apply: true, writeKid: 'k1' })
    expect(r.aborted).toBe('preflight')
    expect(r.columns.reduce((n, c) => n + c.preflightFailed, 0)).toBe(1)
    expect(db.casCalls).toBe(0)
    expect(JSON.stringify([...db.data].map(([k, m]) => [k, [...m]]))).toBe(before)
    expect(exitCodeFor(r)).toBe(2)
    expect(formatResult('dev', r)).toContain('nothing was written')
  })

  it('a v1 value moved to another row fails preflight (AAD) and nothing is written', async () => {
    const db = new FakeDb()
    seedLegacy(db)
    setKeyEnv({ key: K1, writeKid: 'k1' })
    const plate = COLUMN_TARGETS.find((t) => t.column === 'plate_encrypted')!
    db.set(plate, '11111111-0000-4000-8000-000000000000', encrypt('x', ctxFor(plate, '22222222-0000-4000-8000-000000000000')))
    const r = await reencrypt(db, { apply: true, writeKid: 'k1' })
    expect(r.aborted).toBe('preflight')
    expect(db.casCalls).toBe(0)
  })
})

describe('reencrypt-pii — target guard', () => {
  it('accepts the ref in the direct host or the pooler username', () => {
    expect(() => assertTargetMatchesUrl('dev', DEV_URL)).not.toThrow()
    expect(() => assertTargetMatchesUrl('prod', PROD_POOLER_URL)).not.toThrow()
  })

  it('aborts when the URL names the other project', () => {
    expect(() => assertTargetMatchesUrl('prod', DEV_URL)).toThrow(GuardError)
    expect(() => assertTargetMatchesUrl('dev', PROD_POOLER_URL)).toThrow(GuardError)
    // Username says one project, host says the other: ambiguous, so abort either way.
    const mixed = `postgresql://postgres.${PROJECT_REFS.prod}:pw@db.${PROJECT_REFS.dev}.supabase.co:5432/postgres`
    expect(() => assertTargetMatchesUrl('prod', mixed)).toThrow(GuardError)
    expect(() => assertTargetMatchesUrl('dev', mixed)).toThrow(GuardError)
  })

  it('aborts when the ref is absent, or only appears somewhere other than host/username', () => {
    expect(() => assertTargetMatchesUrl('dev', 'postgresql://postgres:pw@localhost:5432/postgres')).toThrow(GuardError)
    expect(() =>
      assertTargetMatchesUrl('dev', `postgresql://postgres:pw@evil.example.com:5432/${PROJECT_REFS.dev}`),
    ).toThrow(GuardError)
    expect(() => assertTargetMatchesUrl('dev', 'not a url')).toThrow(GuardError)
  })

  it('never echoes the URL (it carries the DB password)', () => {
    try {
      assertTargetMatchesUrl('prod', DEV_URL)
    } catch (e) {
      expect((e as Error).message).not.toContain('pw')
      expect((e as Error).message).not.toContain(PROJECT_REFS.dev)
    }
  })
})

describe('reencrypt-pii — arguments and key sources', () => {
  it('requires --target and --env-file; --apply is opt-in', () => {
    expect(() => parseArgs([])).toThrow(GuardError)
    expect(() => parseArgs(['--target=staging', '--env-file=/x'])).toThrow(GuardError)
    expect(() => parseArgs(['--target=dev'])).toThrow(GuardError)
    expect(() => parseArgs(['--target=dev', '--env-file=/x', '--aply'])).toThrow(GuardError)
    expect(parseArgs(['--target=dev', '--env-file=/x'])).toEqual({ target: 'dev', envFile: '/x', apply: false })
    expect(parseArgs(['--target=prod', '--env-file=/x', '--apply']).apply).toBe(true)
  })

  it('refuses keys in the process environment', () => {
    expect(() => assertNoAmbientKeys({ ENCRYPTION_KEY: K1 })).toThrow(GuardError)
    expect(() => assertNoAmbientKeys({ ENCRYPTION_KEYS: `k2:${K2}` })).toThrow(GuardError)
    expect(() => assertNoAmbientKeys({ PATH: '/bin' })).not.toThrow()
  })

  it('refuses an env file inside the repository checkout', () => {
    const roots = repoRoots(SCRIPT_DIR)
    expect(() => assertEnvFileOutsideRepo(resolve(SCRIPT_DIR, '../.env.local'), roots)).toThrow(GuardError)
    expect(() => assertEnvFileOutsideRepo('/Volumes/secrets/dev.env', roots)).not.toThrow()
  })
})

describe('reencrypt-pii — main() end to end with a mocked DB', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'reencrypt-test-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function envFile(url: string, extra = '') {
    const p = join(dir, 'test.env')
    writeFileSync(p, `ENCRYPTION_KEY=${K1}\nENCRYPTION_WRITE_KID=k1\nDATABASE_URL_DIRECT=${url}\n${extra}`)
    return p
  }

  function capture() {
    const out: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void out.push(a.join(' ')))
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void out.push(a.join(' ')))
    return out
  }

  it('ref mismatch aborts before connecting', async () => {
    const connect = vi.fn()
    setKeyEnv({})
    await expect(
      main(['--target=prod', `--env-file=${envFile(DEV_URL)}`, '--apply'], process.env, SCRIPT_DIR, connect),
    ).rejects.toThrow(GuardError)
    expect(connect).not.toHaveBeenCalled()
  })

  it('ambient ENCRYPTION_KEY aborts before connecting', async () => {
    const connect = vi.fn()
    setKeyEnv({ key: K1 })
    await expect(
      main(['--target=dev', `--env-file=${envFile(DEV_URL)}`], process.env, SCRIPT_DIR, connect),
    ).rejects.toThrow(/ENCRYPTION_KEY/)
    expect(connect).not.toHaveBeenCalled()
  })

  it('env file without a write kid aborts before connecting', async () => {
    const connect = vi.fn()
    setKeyEnv({})
    const p = join(dir, 'nokid.env')
    writeFileSync(p, `ENCRYPTION_KEY=${K1}\nDATABASE_URL_DIRECT=${DEV_URL}\n`)
    await expect(main(['--target=dev', `--env-file=${p}`], process.env, SCRIPT_DIR, connect)).rejects.toThrow(
      /ENCRYPTION_WRITE_KID/,
    )
    expect(connect).not.toHaveBeenCalled()
  })

  it('without --apply writes nothing; with --apply writes; output is counts only', async () => {
    const db = new FakeDb()
    const plain = seedLegacy(db)
    const secrets = [...db.data.values()].flatMap((m) => [...m.entries()].flat())
    setKeyEnv({}) // ambient keys empty: main installs them from the env file
    const close = vi.fn(async () => {})
    const connect = vi.fn(async () => ({ db, close }))
    const out = capture()

    const dry = await main(['--target=dev', `--env-file=${envFile(DEV_URL)}`], process.env, SCRIPT_DIR, connect)
    expect(dry).toBe(0)
    expect(db.casCalls).toBe(0)
    expect(close).toHaveBeenCalledTimes(1)

    setKeyEnv({}) // a fresh process: main() installed the file's keys into this env
    const applied = await main(
      ['--target=dev', `--env-file=${envFile(DEV_URL)}`, '--apply'],
      process.env,
      SCRIPT_DIR,
      connect,
    )
    expect(applied).toBe(0)
    expect(db.casCalls).toBe(6)
    const after = [...db.data.values()].flatMap((m) => [...m.values()])
    expect(after.every((ct) => ct.startsWith('v1:k1:'))).toBe(true)

    const printed = out.join('\n')
    expect(printed).toContain('done: rewritten=6 raced=0 failed=0')
    for (const s of [...secrets, ...after, ...plain.values(), K1, 'pw', 'v1|']) {
      expect(printed).not.toContain(s)
    }
  })
})
