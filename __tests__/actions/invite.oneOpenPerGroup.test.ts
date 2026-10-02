import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── #1288 I1b — at most one open invite per group (0076) ────────────────
//
// `drizzle/0076_invite_one_open_per_group.sql` revokes expired-but-open rows,
// keeps only the newest open invite of any group that has several, and adds
// a partial unique index on group_id over open (unaccepted, unrevoked) rows.
//
// Failure looks like: without the index nothing errors when a second open
// invite appears (a code path that forgets to supersede); with it, the
// migration fails to build on prod data if step 2 is wrong.
//
// What this file proves:
//   - the migration on a disposable copy of the table: what each step
//     changes, that the newest open invite is the one kept, that accepted and
//     revoked rows are untouched, that a second run changes 0 rows, and that
//     the rollback script drops the index;
//   - in the real table (index present, as after 0076): minting twice leaves
//     exactly one open invite, and a direct second open row is refused 23505.
//
// The migration block runs in its own schema (search_path), so it never
// touches rows that other test files are using at the same time.
//
// Local throwaway database only (it creates and drops a schema):
//   docker run -d --name pg-1288 -e POSTGRES_PASSWORD=pg -p 127.0.0.1:55288:5432 postgres:17
//   DATABASE_URL_DIRECT=postgres://postgres:pg@127.0.0.1:55288/postgres npx drizzle-kit push --force
//   DATABASE_URL=postgres://postgres:pg@127.0.0.1:55288/postgres npx vitest run __tests__/actions/invite.oneOpenPerGroup.test.ts
// ──────────────────────────────────────────────────────────────────────────

function loadEnvLocal() {
  const envPath = resolve(__dirname, '../../.env.local')
  if (!existsSync(envPath)) return
  const text = readFileSync(envPath, 'utf-8')
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}
loadEnvLocal()

const { AsyncLocalStorage } = await import('node:async_hooks')
const viewerStore = new AsyncLocalStorage<string>()
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: viewerStore.getStore() ?? '' } }, error: null }),
    },
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
vi.mock('@/lib/analytics/server', () => ({
  captureServer: async () => {},
  isUserFirstNonDeletedRecord: async () => false,
}))

const { db } = await import('@/lib/db/client')
const { profiles, oikosGroups, groupBalance, groupEpochs, groupInvites } = await import('@/lib/db/schema')
const { createInvite } = await import('@/actions/invite')
const { generateToken, hashToken } = await import('@/lib/invite')
const { eq, inArray } = await import('drizzle-orm')
const postgres = (await import('postgres')).default

const as = <T>(userId: string, fn: () => Promise<T>) => viewerStore.run(userId, fn)

const databaseUrl = process.env.DATABASE_URL ?? ''
const isLocalDb = (() => {
  try {
    return ['localhost', '127.0.0.1', '::1'].includes(new URL(databaseUrl).hostname)
  } catch {
    return false
  }
})()

let raw: ReturnType<typeof postgres>

beforeAll(() => {
  if (!isLocalDb) return
  raw = postgres(databaseUrl, { max: 1, prepare: false, onnotice: () => {} })
})

afterAll(async () => {
  await raw?.end()
})

const created = { profiles: [] as string[], groups: [] as string[] }

afterEach(async () => {
  if (!isLocalDb) return
  try {
    if (created.groups.length) {
      await db.delete(groupInvites).where(inArray(groupInvites.groupId, created.groups))
      await db.delete(groupEpochs).where(inArray(groupEpochs.groupId, created.groups))
      await db.delete(groupBalance).where(inArray(groupBalance.groupId, created.groups))
      await db.delete(oikosGroups).where(inArray(oikosGroups.id, created.groups))
    }
    if (created.profiles.length) {
      await db.delete(groupEpochs).where(inArray(groupEpochs.memberAId, created.profiles))
      await db.delete(profiles).where(inArray(profiles.id, created.profiles))
    }
  } catch (e) {
    console.error('cleanup failed', e)
  }
  created.profiles = []
  created.groups = []
})

async function person(label: string): Promise<string> {
  const id = randomUUID()
  await db.insert(profiles).values({ id, displayName: `TEST_1288_I1B_${label}` })
  created.profiles.push(id)
  return id
}

async function soloGroup(memberA: string): Promise<string> {
  const [g] = await db.insert(oikosGroups)
    .values({ name: 'TEST_1288_I1B_group', memberA, memberB: null })
    .returning({ id: oikosGroups.id })
  created.groups.push(g.id)
  await db.insert(groupBalance).values({ groupId: g.id, balance: 0, version: 0 })
  await db.insert(groupEpochs).values({ groupId: g.id, startedAt: new Date(), memberAId: memberA, memberBId: null })
  return g.id
}

function sqlstate(e: unknown): string | undefined {
  let cur: unknown = e
  for (let d = 0; cur && d < 4; d++) {
    const code = (cur as { code?: unknown }).code
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code
    cur = (cur as { cause?: unknown }).cause
  }
  return undefined
}

const INDEX = 'GroupInvites_one_open_per_group'

// ─── the migration, on a disposable copy of the table ────────────────────

const root = resolve(__dirname, '../..')
const up = readFileSync(resolve(root, 'drizzle/0076_invite_one_open_per_group.sql'), 'utf-8')
const down = readFileSync(resolve(root, 'scripts/rollback/0076_invite_one_open_per_group.down.sql'), 'utf-8')

const statements = (file: string) =>
  file.split('--> statement-breakpoint').map((s) => s.trim()).filter((s) => s.replace(/^--.*$/gm, '').trim())

/** Run the migration in `schema` the way drizzle-kit does: statement by statement, one transaction. */
async function runUpIn(schema: string): Promise<number[]> {
  return raw.begin(async (t) => {
    await t.unsafe(`SET LOCAL search_path TO "${schema}"`)
    const counts: number[] = []
    for (const stmt of statements(up)) counts.push((await t.unsafe(stmt)).count ?? 0)
    return counts
  }) as Promise<number[]>
}

describe.skipIf(!isLocalDb)('0076 migration (#1288 I1b)', () => {
  const schema = `t0076_${randomUUID().replace(/-/g, '').slice(0, 12)}`

  afterEach(async () => {
    await raw.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
  })

  it('revokes expired and older open rows, keeps the newest, is idempotent, and the rollback drops the index', async () => {
    await raw.unsafe(`CREATE SCHEMA "${schema}"`)
    // Columns and defaults only: no FKs, no indexes — the migration adds the one under test.
    await raw.unsafe(`CREATE TABLE "${schema}"."GroupInvites" (LIKE public."GroupInvites" INCLUDING DEFAULTS)`)
    // The rollback script also deletes 0076's bookkeeping row.
    await raw.unsafe(`CREATE TABLE "${schema}".__drizzle_migrations (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint)`)

    const [g1, g2, g3, g4] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()]
    const inviter = randomUUID()
    const h = (n: number) => sqlInterval(n)
    // g1: expired-open, older live-open, newer live-open
    // g2: three live-open
    // g3: accepted, revoked, one live-open (untouched)
    // g4: one expired-open
    const rows: Array<[string, string, string | null, string | null, string, string]> = [
      ['g1-expired', g1, null, null, h(-1), h(-30)],
      ['g1-older', g1, null, null, h(20), h(-4)],
      ['g1-newest', g1, null, null, h(23), h(-1)],
      ['g2-oldest', g2, null, null, h(10), h(-14)],
      ['g2-middle', g2, null, null, h(12), h(-12)],
      ['g2-newest', g2, null, null, h(22), h(-2)],
      ['g3-accepted', g3, h(-20), null, h(-5), h(-29)],
      ['g3-revoked', g3, null, h(-1), h(1), h(-23)],
      ['g3-open', g3, null, null, h(21), h(-3)],
      ['g4-expired', g4, null, null, h(-2), h(-26)],
    ]
    const ids = new Map<string, string>()
    for (const [label, groupId, acceptedAt, revokedAt, expiresAt, createdAt] of rows) {
      const id = randomUUID()
      ids.set(label, id)
      await raw.unsafe(
        `INSERT INTO "${schema}"."GroupInvites"
           (id, group_id, invited_by, token_hash, expires_at, accepted_at, revoked_at, created_at)
         VALUES ($1, $2, $3, $4, ${expiresAt}, ${acceptedAt ?? 'NULL'}, ${revokedAt ?? 'NULL'}, ${createdAt})`,
        [id, groupId, inviter, hashToken(generateToken())],
      )
    }

    const first = await runUpIn(schema)
    expect(first).toEqual([
      2, // step 1: g1-expired, g4-expired
      3, // step 2: g1-older, g2-oldest, g2-middle
      0, // CREATE INDEX
    ])
    const second = await runUpIn(schema)
    expect(second).toEqual([0, 0, 0])

    const state = await raw.unsafe(
      `SELECT id, accepted_at IS NOT NULL AS accepted, revoked_at IS NOT NULL AS revoked
       FROM "${schema}"."GroupInvites"`,
    )
    const open = new Set(state.filter((r) => !r.accepted && !r.revoked).map((r) => r.id as string))
    expect(open).toEqual(new Set([ids.get('g1-newest'), ids.get('g2-newest'), ids.get('g3-open')]))
    const byId = new Map(state.map((r) => [r.id as string, r]))
    expect(byId.get(ids.get('g3-accepted')!)).toMatchObject({ accepted: true, revoked: false })
    expect(byId.get(ids.get('g3-revoked')!)).toMatchObject({ accepted: false, revoked: true })

    const indexCount = async () => (await raw.unsafe(
      `SELECT count(*)::int AS n FROM pg_indexes
       WHERE schemaname = $1 AND indexname = $2 AND indexdef LIKE 'CREATE UNIQUE INDEX%'
         AND indexdef LIKE '%WHERE ((accepted_at IS NULL) AND (revoked_at IS NULL))%'`,
      [schema, INDEX],
    ))[0].n as number
    expect(await indexCount()).toBe(1)

    // A second open row for g3 is refused; an accepted or revoked one is not.
    const dup = await raw.unsafe(
      `INSERT INTO "${schema}"."GroupInvites" (group_id, invited_by, token_hash, expires_at)
       VALUES ($1, $2, $3, now() + interval '1 hour')`,
      [g3, inviter, hashToken(generateToken())],
    ).catch((e) => e)
    expect(sqlstate(dup)).toBe('23505')
    await raw.unsafe(
      `INSERT INTO "${schema}"."GroupInvites" (group_id, invited_by, token_hash, expires_at, revoked_at)
       VALUES ($1, $2, $3, now() + interval '1 hour', now())`,
      [g3, inviter, hashToken(generateToken())],
    )

    // Rollback: drop the index. The script's bookkeeping DELETE names
    // drizzle.__drizzle_migrations; it is pointed at this schema's copy.
    await raw.begin(async (t) => {
      await t.unsafe(`SET LOCAL search_path TO "${schema}"`)
      await t.unsafe(down.replace(/drizzle\.__drizzle_migrations/g, `"${schema}".__drizzle_migrations`))
    })
    expect(await indexCount()).toBe(0)
    // ...and forward again.
    expect(await runUpIn(schema)).toEqual([0, 0, 0])
    expect(await indexCount()).toBe(1)
  })
})

function sqlInterval(hours: number): string {
  return `now() + interval '${hours} hours'`
}

// ─── the real table, as after 0076 ───────────────────────────────────────

describe.skipIf(!isLocalDb)('one open invite per group in the live table (#1288 I1b)', () => {
  it('the index exists; minting twice leaves exactly one open invite; a second open row is refused', async () => {
    const [{ n }] = await raw`
      SELECT count(*)::int AS n FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'GroupInvites' AND indexname = ${INDEX}`
    expect(n).toBe(1)

    const inviter = await person('inviter')
    const groupId = await soloGroup(inviter)
    expect((await as(inviter, () => createInvite())).ok).toBe(true)
    expect((await as(inviter, () => createInvite())).ok).toBe(true)

    const rows = await db.select().from(groupInvites).where(eq(groupInvites.groupId, groupId))
    expect(rows).toHaveLength(2)
    expect(rows.filter((r) => r.acceptedAt === null && r.revokedAt === null)).toHaveLength(1)

    const dup = await db.insert(groupInvites).values({
      groupId,
      invitedBy: inviter,
      tokenHash: hashToken(generateToken()),
      expiresAt: new Date(Date.now() + 3_600_000),
    }).catch((e) => e)
    expect(sqlstate(dup)).toBe('23505')
  })
})
