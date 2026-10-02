import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { seedAuthUsers, deleteAuthUsers } from './_authUser'

// ─── #1288 I3c — only a hash of the invite token reaches the database ─────
//
// I3a (`drizzle/0070`) added `token_hash` and backfilled it; I3b wrote both
// columns and looked up by hash with a plaintext fallback. I3c stops writing
// the plaintext `token`, drops the fallback, and removes `token` from the
// Drizzle schema. The column itself stays in the database (nullable, no
// longer written) until the I3d migration drops it.
//
// Failure looks like: nothing errors. If the token write comes back, the raw
// join link sits in the table again for anyone who can read it (backups,
// dumps, a leaked DATABASE_URL). If the lookup breaks, every link opens on
// "invalid or expired" and `invite_preview_failed{code:invalid_or_expired}`
// rises.
//
// What this file proves:
//   - no parameter or query text the driver sends while minting carries the
//     raw token (observed at the postgres.js boundary, not assumed);
//   - the stored row has token_hash = hashToken(token) = Postgres' sha256 of
//     it, the raw token appears in no column, and `token` (where the column
//     still exists) is NULL;
//   - mint → preview → accept round trip by hash alone;
//   - a row whose hash is someone else's is not found by this token.
// The malformed-token guard (rejected before any DB call) is proven in
// `__tests__/inviteTokenHash.test.ts`; the "no `token` column reference"
// guard in `__tests__/inviteTokenColumnGuard.test.ts`.
//
// Local throwaway database only:
//   docker run -d --name pg-1288 -e POSTGRES_PASSWORD=pg -p 127.0.0.1:55288:5432 postgres:17
//   DATABASE_URL_DIRECT=postgres://postgres:pg@127.0.0.1:55288/postgres npx drizzle-kit push --force
//   DATABASE_URL=postgres://postgres:pg@127.0.0.1:55288/postgres npx vitest run __tests__/actions/invite.tokenHash.test.ts
//
// No token value is printed or snapshotted: comparisons run in SQL or as
// booleans.
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

// Every query the app's postgres.js client sends — on the pool and inside
// transactions — is recorded while `wire.on` is set.
const wire = { on: false, sent: [] as string[] }
vi.mock('postgres', async (importOriginal) => {
  const real = (await importOriginal<{ default: (...a: unknown[]) => unknown }>()).default
  type Sql = ((...a: unknown[]) => unknown) & Record<string, unknown>
  const record = (query: unknown, params: unknown) => {
    if (wire.on) wire.sent.push(`${String(query)}\n${JSON.stringify(params ?? null)}`)
  }
  const wrap = (sql: Sql): Sql => new Proxy(sql, {
    get(target, prop) {
      if (prop === 'unsafe') {
        return (query: unknown, params: unknown, opts: unknown) => {
          record(query, params)
          return (target.unsafe as (...a: unknown[]) => unknown)(query, params, opts)
        }
      }
      if (prop === 'begin' || prop === 'savepoint') {
        return (...args: unknown[]) => {
          const fn = args[args.length - 1] as (tx: Sql) => unknown
          return (target[prop] as (...a: unknown[]) => unknown)(...args.slice(0, -1), (tx: Sql) => fn(wrap(tx)))
        }
      }
      const v = Reflect.get(target, prop)
      return typeof v === 'function' ? v.bind(target) : v
    },
  })
  const wrapped = (...args: unknown[]) => wrap(real(...args) as Sql)
  return { default: Object.assign(wrapped, real) }
})

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
const { acceptInvite, createInvite, previewInvite } = await import('@/actions/invite')
const { generateToken, hashToken, INVITE_TTL_MS } = await import('@/lib/invite')
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
  wire.on = false
  wire.sent.length = 0
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
      await deleteAuthUsers(created.profiles)
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
  await db.insert(profiles).values({ id, displayName: `TEST_1288_I3_${label}` })
  await seedAuthUsers([{ id, displayName: `TEST_1288_I3_${label}` }])
  created.profiles.push(id)
  return id
}

async function soloGroup(memberA: string): Promise<string> {
  const [g] = await db.insert(oikosGroups)
    .values({ name: 'TEST_1288_I3_group', memberA, memberB: null })
    .returning({ id: oikosGroups.id })
  created.groups.push(g.id)
  await db.insert(groupBalance).values({ groupId: g.id, balance: 0, version: 0 })
  await db.insert(groupEpochs).values({ groupId: g.id, startedAt: new Date(), memberAId: memberA, memberBId: null })
  return g.id
}

const tokenOf = (url: string) => url.slice(url.lastIndexOf('/invite/') + '/invite/'.length)

async function expectPreviewAndAccept(joiner: string, groupId: string, token: string) {
  const preview = await as(joiner, () => previewInvite(token))
  expect(preview).toMatchObject({ ok: true, data: { ok: true, groupId } })
  expect(await as(joiner, () => acceptInvite(token))).toEqual({ ok: true, data: groupId })
  const [g] = await db.select().from(oikosGroups).where(eq(oikosGroups.id, groupId))
  expect(g.memberB).toBe(joiner)
}

describe.skipIf(!isLocalDb)('invite tokens: only the hash is stored (#1288 I3c)', () => {
  it('minting sends the raw token in no query or parameter', async () => {
    const inviter = await person('inviter')
    await soloGroup(inviter)

    wire.on = true
    const minted = await as(inviter, () => createInvite())
    wire.on = false
    expect(minted.ok).toBe(true)
    const token = tokenOf((minted as { ok: true; data: string }).data)

    // The recorder saw the mint's INSERT (so "nothing found" is not vacuous)...
    expect(wire.sent.some((q) => q.includes('insert into "GroupInvites"'))).toBe(true)
    // ...and its hash, but never the token itself.
    expect(wire.sent.some((q) => q.includes(hashToken(token)))).toBe(true)
    expect(wire.sent.some((q) => q.includes(token))).toBe(false)
  })

  it('the stored row carries the hash and nowhere the raw token; mint → preview → accept works by hash', async () => {
    const inviter = await person('inviter')
    const joiner = await person('joiner')
    const groupId = await soloGroup(inviter)

    const minted = await as(inviter, () => createInvite())
    expect(minted.ok).toBe(true)
    const token = tokenOf((minted as { ok: true; data: string }).data)

    const [row] = await raw`
      SELECT g.id,
             g.token_hash = ${hashToken(token)} AS hash_is_node_hash,
             g.token_hash = encode(sha256(convert_to(${token}::text, 'UTF8')), 'hex') AS hash_is_pg_hash,
             position(${token}::text IN to_jsonb(g)::text) = 0 AS raw_token_nowhere,
             (to_jsonb(g) ->> 'token') IS NULL AS plaintext_null
      FROM "GroupInvites" g WHERE g.group_id = ${groupId}`
    expect({ ...row, id: undefined }).toEqual({
      id: undefined,
      hash_is_node_hash: true,
      hash_is_pg_hash: true,
      raw_token_nowhere: true,
      plaintext_null: true,
    })

    await expectPreviewAndAccept(joiner, groupId, token)
    const [after] = await db.select().from(groupInvites).where(eq(groupInvites.id, row.id as string))
    expect(after.acceptedAt).not.toBeNull()
  })

  it('a row is found only by its own hash', async () => {
    const inviter = await person('inviter')
    const joiner = await person('joiner')
    const groupId = await soloGroup(inviter)
    const token = generateToken()
    const [row] = await db.insert(groupInvites).values({
      groupId,
      invitedBy: inviter,
      tokenHash: hashToken(generateToken()), // another token's hash
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    }).returning({ id: groupInvites.id })

    expect(await as(joiner, () => previewInvite(token)))
      .toEqual({ ok: true, data: { ok: false, error: 'invalid_or_expired' } })
    expect(await as(joiner, () => acceptInvite(token)))
      .toEqual({ ok: false, code: 'invalid_or_expired' })
    const [after] = await db.select().from(groupInvites).where(eq(groupInvites.id, row.id))
    expect(after.acceptedAt).toBeNull()
  })

  it('an unknown well-formed token is invalid_or_expired', async () => {
    const joiner = await person('joiner')
    expect(await as(joiner, () => acceptInvite(generateToken())))
      .toEqual({ ok: false, code: 'invalid_or_expired' })
  })
})
