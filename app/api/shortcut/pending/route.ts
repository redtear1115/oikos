// #1536 — an iOS Shortcut sends an amount here with the owner's personal key;
// Futari stores it as a pending card only that owner sees, and it enters the
// ledger only when the owner confirms it on the dashboard.
//
//   POST /api/shortcut/pending
//   Authorization: Bearer fts_sk_<43 base64url>
//   Content-Type: application/json
//   {"amount": 120, "category": "dining", "note": "午餐"}   → 201 {"ok":true}
//
// Trust boundary. This route is public in proxy.ts (exact path only) and is
// authenticated by the key alone. It NEVER reads the cookie session: no
// createClient / getCurrentUser / requireViewer here. A browser that happens
// to carry a Futari session gets nothing from it, so there is no CSRF surface,
// and no CORS headers are sent (a Shortcut is not a browser).
// Failure look if someone "helpfully" falls back to the session: nothing
// errors; any page that can make a signed-in browser POST here could plant
// cards in that user's dashboard.
//
// Order of checks, each before the next costs anything:
//   1. the key: only from `Authorization: Bearer`, shape-checked before any
//      query, looked up by hashShortcutKey. Malformed, unknown, revoked, owner
//      deleted (tombstone: profile_is_live false), or owner asked for deletion
//      (14-day grace) → the SAME 401, so a caller cannot tell them apart. The
//      body is not read until the key is valid.
//   2. Content-Type must be application/json (415); the body is capped at
//      2048 bytes by Content-Length (413) AND by counting the stream (413), so
//      a chunked body without a length cannot get past the cap; strict UTF-8
//      and JSON.parse failures → 400; then lib/quickAdd parseQuickAddJson
//      (only amount / category / note; type-gated) → 400.
//   3. One transaction re-checks the key under locks, then the ledger (409),
//      the rate limits (429), inserts, and stamps last_used_at.
//
// Lock order, and why. actions/shortcutKey.ts (generate / revoke) takes the
// owner's `Profiles` row FOR NO KEY UPDATE first, then that user's
// ShortcutKeys rows. This route takes the same two in the same order:
//   Profiles (lockProfileRow) → ShortcutKeys row FOR UPDATE → inserts.
// It never holds a key row while waiting for the Profiles row, so it cannot
// close a cycle with a generate/revoke (which would be a 40P01 deadlock and a
// 500 for one side). The account-deletion job (0096) locks OikosGroups,
// then Profiles FOR UPDATE, then deletes auth.users (cascading to both
// shortcut tables); this route only READS OikosGroups (no lock) and takes
// nothing before Profiles, so it cannot close a cycle with the job either:
// whichever gets the Profiles row first finishes, and a POST that waited for
// the job finds the owner gone (lockProfileRow → 401).
// The Profiles lock is also what makes the count-based limits exact: every
// POST for one owner runs its count-then-insert one after another, so 20
// parallel requests cannot all see "29" and all insert.
// The key row is re-read under the lock with `revoked_at IS NULL`: a key
// revoked (or regenerated) between step 1 and the lock gets 401 and inserts
// nothing.
//
// What never leaves this file: the key, its hint or hash, the amount, the
// category or the note. Not in a response (error bodies are fixed strings and
// never echo input), not in console output, not in Sentry (an unexpected
// error is reported as a new Error naming only the Postgres error code; the
// server Sentry config also drops request headers and bodies). Responses carry
// Cache-Control: no-store.

import * as Sentry from '@sentry/nextjs'
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { oikosGroups, profiles, shortcutKeys, shortcutPendingExpenses } from '@/lib/db/schema'
import { lockProfileRow } from '@/lib/db/queries/epoch'
import { isActionError } from '@/lib/action-errors'
import { hashShortcutKey, isWellFormedShortcutKey } from '@/lib/shortcutKey'
import { parseQuickAddJson } from '@/lib/quickAdd'
import { getCategoryForMerchant } from '@/lib/db/queries/merchantMemory'

export const dynamic = 'force-dynamic'

/** Largest accepted body, in bytes. */
const SHORTCUT_PENDING_MAX_BODY = 2048
/** Cards one key may create in a rolling hour, skipped ones included. */
const SHORTCUT_PENDING_PER_KEY_PER_HOUR = 30
/** Open (not skipped, not older than 30 days) cards one person may have. */
const SHORTCUT_PENDING_MAX_OPEN = 50

const NO_STORE = 'no-store, max-age=0'

function reply(status: number, body: Record<string, unknown>, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': NO_STORE, ...extra },
  })
}

// Fixed bodies: never built from the request.
const unauthorized = () => reply(401, { ok: false, error: 'unauthorized' }, { 'WWW-Authenticate': 'Bearer' })
const badRequest = () => reply(400, { ok: false, error: 'invalid_request' })
const unsupported = () => reply(415, { ok: false, error: 'unsupported_media_type' })
const tooLarge = () => reply(413, { ok: false, error: 'payload_too_large' })
const noLedger = () => reply(409, { ok: false, error: 'no_ledger' })
const rateLimited = () => reply(429, { ok: false, error: 'rate_limited' })
const methodNotAllowed = () => reply(405, { ok: false, error: 'method_not_allowed' }, { Allow: 'POST' })

/** `Authorization: Bearer <token>` → token; anything else → null. */
function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header) return null
  const m = /^Bearer ([^\s]+)$/i.exec(header.trim())
  return m ? m[1] : null
}

/** Media type `application/json`, parameters (charset) allowed, case-insensitive. */
function isJsonContentType(value: string | null): boolean {
  if (!value) return false
  return value.split(';', 1)[0].trim().toLowerCase() === 'application/json'
}

type BodyResult = { ok: true; text: string } | { ok: false; status: 400 | 413 }

/**
 * Read at most SHORTCUT_PENDING_MAX_BODY bytes; one byte more aborts with 413
 * whatever Content-Length said (or whether it was sent at all). Strict UTF-8.
 */
async function readCappedBody(request: Request): Promise<BodyResult> {
  const declared = request.headers.get('content-length')
  if (declared !== null && /^\d+$/.test(declared.trim()) && Number(declared.trim()) > SHORTCUT_PENDING_MAX_BODY) {
    return { ok: false, status: 413 }
  }
  if (!request.body) return { ok: false, status: 400 }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > SHORTCUT_PENDING_MAX_BODY) {
      await reader.cancel().catch(() => {})
      return { ok: false, status: 413 }
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    bytes.set(c, offset)
    offset += c.byteLength
  }
  try {
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  } catch {
    return { ok: false, status: 400 }
  }
}

interface ResolvedKey {
  keyId: string
  userId: string
}

/**
 * Step 1, no locks: an unrevoked key with this hash whose owner is live and
 * has not asked for deletion. null for every other case (one 401).
 */
async function resolveKey(token: string | null): Promise<ResolvedKey | null> {
  if (!isWellFormedShortcutKey(token)) return null
  const [row] = await db
    .select({
      keyId: shortcutKeys.id,
      userId: shortcutKeys.userId,
      deletionRequestedAt: profiles.deletionRequestedAt,
      live: sql<boolean>`public.profile_is_live(${shortcutKeys.userId})`,
    })
    .from(shortcutKeys)
    .innerJoin(profiles, eq(profiles.id, shortcutKeys.userId))
    .where(and(eq(shortcutKeys.keyHash, hashShortcutKey(token)), isNull(shortcutKeys.revokedAt)))
    .limit(1)
  if (!row || !row.live || row.deletionRequestedAt !== null) return null
  return { keyId: row.keyId, userId: row.userId }
}

type WriteOutcome = 'created' | 'unauthorized' | 'no_ledger' | 'rate_limited'

async function writePending(
  key: ResolvedKey,
  prefill: { amount: number; category?: string; description?: string },
): Promise<WriteOutcome> {
  return db.transaction(async (tx): Promise<WriteOutcome> => {
    // Lock 1: the owner's Profiles row (see the header for the order).
    // Throws profile_not_found when the account is gone or a tombstone.
    try {
      await lockProfileRow(tx, key.userId)
    } catch (e) {
      if (isActionError(e, 'profile_not_found')) return 'unauthorized'
      throw e
    }

    // Grace period: read under the lock (lockProfileRow only checks liveness).
    const [owner] = await tx
      .select({ deletionRequestedAt: profiles.deletionRequestedAt })
      .from(profiles)
      .where(eq(profiles.id, key.userId))
    if (!owner || owner.deletionRequestedAt !== null) return 'unauthorized'

    // Lock 2: the key row, still unrevoked and still this owner's.
    const [locked] = await tx
      .select({ id: shortcutKeys.id })
      .from(shortcutKeys)
      .where(and(
        eq(shortcutKeys.id, key.keyId),
        eq(shortcutKeys.userId, key.userId),
        isNull(shortcutKeys.revokedAt),
      ))
      .for('update')
    if (!locked) return 'unauthorized'

    // A ledger is required (confirming writes into it). Read under the
    // Profiles lock, which createGroup / acceptInvite also take.
    const [ledger] = await tx
      .select({ id: oikosGroups.id })
      .from(oikosGroups)
      .where(or(eq(oikosGroups.memberA, key.userId), eq(oikosGroups.memberB, key.userId)))
      .limit(1)
    if (!ledger) return 'no_ledger'

    // #1822 — merchant memory lookup. When a description is present (the iOS
    // Shortcut may send it as "note"), check if this merchant has been recorded
    // before and use that category if no explicit category was sent. This lets
    // Shortcuts that only send {amount, note} auto-fill the category from
    // household history, same as quick-add #1488. The lookup runs inside the
    // transaction so it sees the latest committed state.
    let merchantCategory: string | null = null
    if (prefill.description?.trim()) {
      merchantCategory = (await getCategoryForMerchant(ledger.id, prefill.description, tx)) ?? null
    }

    const [{ n: lastHour }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(shortcutPendingExpenses)
      .where(and(
        eq(shortcutPendingExpenses.keyId, key.keyId),
        gt(shortcutPendingExpenses.createdAt, sql`now() - interval '1 hour'`),
      ))
    if (lastHour >= SHORTCUT_PENDING_PER_KEY_PER_HOUR) return 'rate_limited'

    const [{ n: open }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(shortcutPendingExpenses)
      .where(and(
        eq(shortcutPendingExpenses.userId, key.userId),
        isNull(shortcutPendingExpenses.skippedAt),
        gt(shortcutPendingExpenses.createdAt, sql`now() - interval '30 days'`),
      ))
    if (open >= SHORTCUT_PENDING_MAX_OPEN) return 'rate_limited'

    await tx.insert(shortcutPendingExpenses).values({
      userId: key.userId,
      keyId: key.keyId,
      amount: prefill.amount,
      category: merchantCategory ?? prefill.category ?? null,
      description: prefill.description ?? null,
    })
    await tx
      .update(shortcutKeys)
      .set({ lastUsedAt: sql`now()` })
      .where(eq(shortcutKeys.id, key.keyId))
    return 'created'
  })
}

/** Postgres SQLSTATE of an error (or its cause), for a report that carries nothing else. */
function pgCode(e: unknown): string {
  for (let cur: unknown = e, i = 0; cur && i < 4; cur = (cur as { cause?: unknown }).cause, i++) {
    const code = (cur as { code?: unknown }).code
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code
  }
  return 'unknown'
}

export async function POST(request: Request): Promise<Response> {
  try {
    // 1. Key first; the body is untouched until it checks out.
    const key = await resolveKey(bearerToken(request))
    if (!key) return unauthorized()

    // 2. Body.
    if (!isJsonContentType(request.headers.get('content-type'))) return unsupported()
    const body = await readCappedBody(request)
    if (!body.ok) return body.status === 413 ? tooLarge() : badRequest()
    let json: unknown
    try {
      json = JSON.parse(body.text)
    } catch {
      return badRequest()
    }
    const parsed = parseQuickAddJson(json)
    if (!parsed.ok) return badRequest()

    // 3. Write.
    const outcome = await writePending(key, parsed.prefill)
    switch (outcome) {
      case 'created': return reply(201, { ok: true })
      case 'unauthorized': return unauthorized()
      case 'no_ledger': return noLedger()
      case 'rate_limited': return rateLimited()
    }
  } catch (e) {
    // Never the raw error: a driver error can quote bound values.
    Sentry.captureException(new Error(`shortcut pending failed: ${pgCode(e)}`), {
      tags: { area: 'shortcut', op: 'pending_create' },
    })
    return reply(500, { ok: false, error: 'server_error' })
  }
}

export function GET(): Response { return methodNotAllowed() }
export function HEAD(): Response { return methodNotAllowed() }
export function PUT(): Response { return methodNotAllowed() }
export function PATCH(): Response { return methodNotAllowed() }
export function DELETE(): Response { return methodNotAllowed() }
export function OPTIONS(): Response { return methodNotAllowed() }
