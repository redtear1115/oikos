import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── #1288 I3 — invite lookups by token hash (I3a migration + I3b code) ───
//
// I3a (`drizzle/0070_invite_token_hash_expand.sql`) adds a nullable
// `token_hash`, makes `token` nullable, backfills the hash and indexes it.
// I3b mints rows with both columns and finds an invite with
//   token_hash = $h OR (token_hash IS NULL AND token = $t)
// so rows minted by the previous code (hash still NULL until the backfill is
// re-run) keep working.
//
// Failure looks like: nothing errors. A link that should work opens on
// "invalid or expired", and `invite_preview_failed{code:invalid_or_expired}`
// rises.
//
// What this file proves:
//   - mint → preview → accept round trip; the stored hash equals the one
//     Postgres computes from the stored token;
//   - a row with only `token` (what the previous code writes) can be previewed
//     and accepted;
//   - a row with only `token_hash` (what the next step, I3c, will write) can
//     be previewed and accepted;
//   - the fallback applies only while the hash is NULL;
//   - the migration: backfill hash = Node hash, a second run changes 0 rows,
//     the unique index holds, `token` accepts NULL; and the rollback script
//     restores the previous shape.
//
// Local throwaway database only: the migration block rewrites the whole
// table and drops a column, and these tests need 0070 applied, which dev and
// prod may not have yet. Run this file on its own (another file running at
// the same time would see the column come and go):
//   docker run -d --name pg-1288i3 -e POSTGRES_PASSWORD=pg -p 127.0.0.1:55550:5432 postgres:17
//   DATABASE_URL_DIRECT=postgres://postgres:pg@127.0.0.1:55550/postgres npx drizzle-kit push --force
//   DATABASE_URL=postgres://postgres:pg@127.0.0.1:55550/postgres npx vitest run __tests__/actions/invite.tokenHash.test.ts
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
const { profiles, oikosGroups, groupBalance, groupEpochs } = await import('@/lib/db/schema')
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
  if (!isLocalDb) return
  try {
    if (created.groups.length) {
      await raw`DELETE FROM "GroupInvites" WHERE group_id = ANY(${created.groups}::uuid[])`
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
  await db.insert(profiles).values({ id, displayName: `TEST_1288_I3_${label}` })
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

const expiresAt = () => new Date(Date.now() + INVITE_TTL_MS)

/** The INSERT the code before I3b runs: `token` only, no hash. */
async function seedTokenOnly(groupId: string, invitedBy: string) {
  const token = generateToken()
  const [row] = await raw`
    INSERT INTO "GroupInvites" (group_id, invited_by, token, expires_at)
    VALUES (${groupId}, ${invitedBy}, ${token}, ${expiresAt()})
    RETURNING id`
  return { id: row.id as string, token }
}

/** The INSERT I3c will run: hash only, `token` NULL. */
async function seedHashOnly(groupId: string, invitedBy: string) {
  const token = generateToken()
  const [row] = await raw`
    INSERT INTO "GroupInvites" (group_id, invited_by, token, token_hash, expires_at)
    VALUES (${groupId}, ${invitedBy}, NULL, ${hashToken(token)}, ${expiresAt()})
    RETURNING id`
  return { id: row.id as string, token }
}

async function inviteState(id: string) {
  const [r] = await raw`
    SELECT token IS NULL AS token_null,
           token_hash IS NULL AS hash_null,
           accepted_at IS NOT NULL AS accepted
    FROM "GroupInvites" WHERE id = ${id}`
  return r as unknown as { token_null: boolean; hash_null: boolean; accepted: boolean }
}

async function expectPreviewAndAccept(joiner: string, groupId: string, token: string) {
  const preview = await as(joiner, () => previewInvite(token))
  expect(preview).toMatchObject({ ok: true, data: { ok: true, groupId } })
  expect(await as(joiner, () => acceptInvite(token))).toEqual({ ok: true, data: groupId })
  const [g] = await db.select().from(oikosGroups).where(eq(oikosGroups.id, groupId))
  expect(g.memberB).toBe(joiner)
}

describe.skipIf(!isLocalDb)('invite lookup by token hash (#1288 I3b)', () => {
  it('mint → preview → accept; the row carries both columns and the hash matches Postgres', async () => {
    const inviter = await person('inviter')
    const joiner = await person('joiner')
    const groupId = await soloGroup(inviter)

    const minted = await as(inviter, () => createInvite())
    expect(minted.ok).toBe(true)
    const token = (minted as { ok: true; data: string }).data.split('/invite/')[1]

    const [row] = await raw`
      SELECT id,
             token_hash = ${hashToken(token)} AS hash_is_node_hash,
             token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex') AS hash_is_pg_hash,
             token IS NOT NULL AS has_token
      FROM "GroupInvites" WHERE group_id = ${groupId}`
    expect({ ...row, id: undefined }).toEqual({
      id: undefined, hash_is_node_hash: true, hash_is_pg_hash: true, has_token: true,
    })

    await expectPreviewAndAccept(joiner, groupId, token)
    expect((await inviteState(row.id as string)).accepted).toBe(true)
  })

  it('a row with token only (NULL token_hash, as the previous code mints it) can be previewed and accepted', async () => {
    const inviter = await person('inviter')
    const joiner = await person('joiner')
    const groupId = await soloGroup(inviter)
    const invite = await seedTokenOnly(groupId, inviter)
    expect(await inviteState(invite.id)).toEqual({ token_null: false, hash_null: true, accepted: false })

    await expectPreviewAndAccept(joiner, groupId, invite.token)
    expect((await inviteState(invite.id)).accepted).toBe(true)
  })

  it('a row with token_hash only (NULL token, as I3c will mint it) can be previewed and accepted', async () => {
    const inviter = await person('inviter')
    const joiner = await person('joiner')
    const groupId = await soloGroup(inviter)
    const invite = await seedHashOnly(groupId, inviter)
    expect(await inviteState(invite.id)).toEqual({ token_null: true, hash_null: false, accepted: false })

    await expectPreviewAndAccept(joiner, groupId, invite.token)
    expect((await inviteState(invite.id)).accepted).toBe(true)
  })

  it('the plaintext fallback applies only while token_hash is NULL', async () => {
    const inviter = await person('inviter')
    const joiner = await person('joiner')
    const groupId = await soloGroup(inviter)
    const invite = await seedTokenOnly(groupId, inviter)
    // A hash that is not this token's: the row must no longer be found by
    // its plaintext column.
    await raw`UPDATE "GroupInvites" SET token_hash = ${hashToken(generateToken())} WHERE id = ${invite.id}`

    expect(await as(joiner, () => previewInvite(invite.token)))
      .toEqual({ ok: true, data: { ok: false, error: 'invalid_or_expired' } })
    expect(await as(joiner, () => acceptInvite(invite.token)))
      .toEqual({ ok: false, code: 'invalid_or_expired' })
    expect((await inviteState(invite.id)).accepted).toBe(false)
  })

  it('an unknown well-formed token is invalid_or_expired', async () => {
    const joiner = await person('joiner')
    expect(await as(joiner, () => acceptInvite(generateToken())))
      .toEqual({ ok: false, code: 'invalid_or_expired' })
  })
})

// ─── the migration ────────────────────────────────────────────────────────

const root = resolve(__dirname, '../..')
const up = readFileSync(resolve(root, 'drizzle/0070_invite_token_hash_expand.sql'), 'utf-8')
const down = readFileSync(resolve(root, 'scripts/rollback/0070_invite_token_hash_expand.down.sql'), 'utf-8')

/** Run the migration the way drizzle-kit does: statement by statement. */
async function runUp(): Promise<{ backfilled: number }> {
  let backfilled = -1
  for (const stmt of up.split('--> statement-breakpoint')) {
    const res = await raw.unsafe(stmt)
    if (/^\s*UPDATE/m.test(stmt.replace(/^--.*$/gm, ''))) backfilled = res.count
  }
  return { backfilled }
}

async function runDown() {
  // The rollback also deletes 0070's bookkeeping row; the throwaway database
  // was built with `drizzle-kit push`, which has no bookkeeping table.
  await raw.unsafe(`CREATE SCHEMA IF NOT EXISTS drizzle;
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint)`)
  await raw.begin((t) => t.unsafe(down))
}

async function shape() {
  const cols = await raw`
    SELECT column_name, is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'GroupInvites' AND column_name IN ('token', 'token_hash')
    ORDER BY column_name`
  const [idx] = await raw`
    SELECT count(*)::int AS n FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'GroupInvites'
      AND indexname = 'GroupInvites_token_hash_unique' AND indexdef LIKE 'CREATE UNIQUE INDEX%'`
  return {
    columns: Object.fromEntries(cols.map((c) => [c.column_name, c.is_nullable])),
    uniqueHashIndex: idx.n === 1,
  }
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

describe.skipIf(!isLocalDb)('0070 migration (#1288 I3a)', () => {
  it('backfills the Node hash, is idempotent, indexes uniquely, and the rollback restores the old shape', async () => {
    const inviter = await person('inviter')
    const groupId = await soloGroup(inviter)

    // Start from the shape before 0070, as prod has it now.
    await runDown()
    expect(await shape()).toEqual({ columns: { token: 'NO' }, uniqueHashIndex: false })

    const tokens = [generateToken(), generateToken(), generateToken()]
    for (const t of tokens) {
      await raw`INSERT INTO "GroupInvites" (group_id, invited_by, token, expires_at)
                VALUES (${groupId}, ${inviter}, ${t}, ${expiresAt()})`
    }

    const first = await runUp()
    const second = await runUp()
    expect(first.backfilled).toBeGreaterThanOrEqual(tokens.length) // every row in the table
    expect(second.backfilled).toBe(0)
    expect(await shape()).toEqual({ columns: { token: 'YES', token_hash: 'YES' }, uniqueHashIndex: true })

    const [{ n: unhashed }] = await raw`SELECT count(*)::int AS n FROM "GroupInvites" WHERE token_hash IS NULL`
    expect(unhashed).toBe(0)

    // Postgres's backfill equals Node's hashToken for every row.
    const matches = await Promise.all(tokens.map(async (t) => {
      const [r] = await raw`SELECT count(*)::int AS n FROM "GroupInvites"
                            WHERE group_id = ${groupId} AND token = ${t} AND token_hash = ${hashToken(t)}`
      return r.n as number
    }))
    expect(matches).toEqual([1, 1, 1])

    // Unique: a second row with an existing hash is refused.
    const dup = await raw`INSERT INTO "GroupInvites" (group_id, invited_by, token, token_hash, expires_at)
      VALUES (${groupId}, ${inviter}, NULL, ${hashToken(tokens[0])}, ${expiresAt()})`.catch((e) => e)
    expect(sqlstate(dup)).toBe('23505')

    // `token` accepts NULL now (I3c will rely on it); NULL hashes don't collide.
    await raw`INSERT INTO "GroupInvites" (group_id, invited_by, token, token_hash, expires_at)
      VALUES (${groupId}, ${inviter}, NULL, ${hashToken(generateToken())}, ${expiresAt()})`
    await raw`INSERT INTO "GroupInvites" (group_id, invited_by, token, expires_at)
      VALUES (${groupId}, ${inviter}, ${generateToken()}, ${expiresAt()})`
    await raw`INSERT INTO "GroupInvites" (group_id, invited_by, token, expires_at)
      VALUES (${groupId}, ${inviter}, ${generateToken()}, ${expiresAt()})`

    // A re-run (gate G1) hashes the two rows minted "by old code" above.
    expect((await runUp()).backfilled).toBe(2)

    // Rollback, then forward again. The rollback needs every row to still have
    // a token, which holds until I3c ships; drop the one hash-only row first.
    await raw`DELETE FROM "GroupInvites" WHERE group_id = ${groupId} AND token IS NULL`
    await runDown()
    expect(await shape()).toEqual({ columns: { token: 'NO' }, uniqueHashIndex: false })
    await runUp()
    expect(await shape()).toEqual({ columns: { token: 'YES', token_hash: 'YES' }, uniqueHashIndex: true })
  })
})
