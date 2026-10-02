// ─── #1449 — an auth.users row for a test profile ──────────────────────────
//
// acceptInvite and createGroup refuse a profile whose account is gone
// (`profile_not_found`, lockProfileRow in lib/db/queries/epoch.ts): that is
// how they tell a live user from the tombstone the account-deletion job
// leaves behind, and the only signal is the auth.users row. A fixture that
// inserts "Profiles" directly therefore has to add the auth row too, or every
// accept / createGroup it drives fails with profile_not_found. Failure looks
// like: `{ ok: false, code: 'profile_not_found' }` where the test expected
// ok: true, or an `ActionError: profile_not_found` from a seed step.
//
// Insert the Profiles row first, then call this: handle_new_user (the
// on_auth_user_created trigger) does ON CONFLICT DO NOTHING, so the fixture's
// row is kept as written.
//
// Connection: on a local throwaway DB, DATABASE_URL (it is the superuser
// there). Anywhere else DATABASE_URL is the runtime role (futari_app), which
// cannot touch schema auth, so DATABASE_URL_DIRECT (the admin role) is used —
// the same split as accountDeletion0068.test.ts. Never DATABASE_URL_DIRECT
// against a local DATABASE_URL: .env.local fills it in with dev's.

import postgres from 'postgres'

function adminUrl(): string {
  const appUrl = process.env.DATABASE_URL ?? ''
  let local = false
  try {
    local = ['localhost', '127.0.0.1', '::1'].includes(new URL(appUrl).hostname)
  } catch {
    local = false
  }
  if (local) return appUrl
  const direct = process.env.DATABASE_URL_DIRECT
  if (!direct) throw new Error('DATABASE_URL_DIRECT not set; seeding auth.users needs the admin connection.')
  return direct
}

async function withAdmin<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(adminUrl(), { max: 1, prepare: false, onnotice: () => {} })
  try {
    return await fn(sql)
  } finally {
    await sql.end()
  }
}

/** Give already-inserted Profiles rows their auth.users rows. */
export async function seedAuthUsers(users: Array<{ id: string; displayName: string }>): Promise<void> {
  if (users.length === 0) return
  await withAdmin(async (sql) => {
    for (const u of users) {
      await sql`
        INSERT INTO auth.users (id, raw_user_meta_data)
        VALUES (${u.id}, jsonb_build_object('full_name', ${u.displayName}::text))
        ON CONFLICT (id) DO NOTHING`
    }
  })
}

/** Remove the auth.users rows {@link seedAuthUsers} added. */
export async function deleteAuthUsers(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await withAdmin(async (sql) => {
    await sql`DELETE FROM auth.users WHERE id = ANY(${ids}::uuid[])`
  })
}
