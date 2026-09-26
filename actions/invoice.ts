'use server'

import { db } from '@/lib/db/client'
import { invoiceCredentials } from '@/lib/db/schema'
import {
  validateInvoiceCarrierInput,
  type InvoiceCarrierInput,
} from '@/lib/validators'
import { randomUUID } from 'crypto'
import { encrypt, aadFor } from '@/lib/crypto'
import { fetchInvoicesByCarrier } from '@/lib/invoice/api'
import { and, eq, isNull } from 'drizzle-orm'
import { requireViewerGroup } from '@/lib/auth/viewer'
import { revalidateSettings } from '@/lib/revalidate'
import { action, actionError, type ActionErrorCode } from '@/lib/action-errors'

/**
 * v0.9.0 Phase A — credential CRUD only.
 * Phase B will add previewInvoiceImport / commitInvoiceImport here.
 *
 * Conventions (mirror actions/income.ts):
 *   - All mutations open a single supabase auth check + group lookup
 *     (via `requireViewerGroup` from lib/auth/viewer).
 *   - Edits use soft-delete + insert atomically (DB-level UPDATE is forbidden
 *     for user-mutable fields; status / lastSyncedAt are server-only metadata
 *     and may be UPDATEd in place).
 */

// Known 財政部 MoF API error codes mapped to action error codes (#1156 — the
// user-readable sentences live in `errors.actions.invoice_mof_*` in each locale).
// Unknown codes fall through to `invoice_mof_verify_failed` (carries the raw code).
// Add new codes here as we encounter them — keeping this as a const Record (vs a
// switch) keeps additions a one-line change and makes the full coverage greppable.
const MOF_ERROR_CODES: Record<string, ActionErrorCode> = {
  '919': 'invoice_mof_code_invalid',
  '953': 'invoice_mof_unavailable',
  '998': 'invoice_mof_unavailable',
}

function mapMofError(code: string): Error {
  const mapped = MOF_ERROR_CODES[code]
  return mapped ? actionError(mapped) : actionError('invoice_mof_verify_failed', { code })
}

/**
 * #1289 — the pre-check SELECT in create / refresh races a double submit: both
 * requests see no live row, both insert, and the partial unique index
 * `invoice_credentials_uniq` rejects the second with 23505. Map that to the
 * same expected failure the pre-check returns, so the raw driver error (whose
 * message carries the query parameters: barcode and ciphertext) never leaves
 * the action.
 */
function isBarcodeUniqueViolation(e: unknown): boolean {
  let cur: unknown = e
  for (let depth = 0; cur && depth < 3; depth++) {
    const err = cur as { code?: unknown; constraint_name?: unknown; constraint?: unknown }
    if (err.code === '23505') {
      const name = err.constraint_name ?? err.constraint
      return name === undefined || name === 'invoice_credentials_uniq'
    }
    cur = (cur as { cause?: unknown }).cause
  }
  return false
}

async function mapBarcodeConflict<T>(body: () => Promise<T>): Promise<T> {
  try {
    return await body()
  } catch (e) {
    if (isBarcodeUniqueViolation(e)) throw actionError('invoice_barcode_already_bound')
    throw e
  }
}

/**
 * Verify barcode + verificationCode against the (mock) MoF API by issuing a
 * 7-day historical query. Throws a user-readable message on failure. Does not
 * persist anything; caller decides what to do with the success signal.
 */
async function verifyCarrierAgainstApi(barcode: string, verificationCode: string): Promise<void> {
  const today = new Date()
  const past = new Date(today)
  past.setDate(past.getDate() - 7)
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`

  const result = await fetchInvoicesByCarrier({
    barcode,
    verificationCode,
    startDate: fmt(past),
    endDate: fmt(today),
  })

  if (!result.ok) {
    throw mapMofError(result.code)
  }
}

export type CreateInvoiceCredentialInput = InvoiceCarrierInput

/**
 * Bind a new mobile-barcode carrier to the viewer's group. Validates input,
 * runs a verification round-trip against the API (mock in Phase A), encrypts
 * the verification code, and persists the row.
 */
export const createInvoiceCredential = action(async (
  input: CreateInvoiceCredentialInput,
): Promise<{ id: string }> => {
  const validated = validateInvoiceCarrierInput(input)
  const { user, group } = await requireViewerGroup()

  // Reject duplicate (active) registration of the same barcode by the same user.
  const [existing] = await db
    .select({ id: invoiceCredentials.id })
    .from(invoiceCredentials)
    .where(and(
      eq(invoiceCredentials.groupId, group.id),
      eq(invoiceCredentials.userId, user.id),
      eq(invoiceCredentials.barcode, validated.barcode),
      isNull(invoiceCredentials.deletedAt),
    ))
    .limit(1)
  if (existing) throw actionError('invoice_barcode_already_bound')

  await verifyCarrierAgainstApi(validated.barcode, validated.verificationCode)

  // #1287 — id generated here so the AAD binds to the row's primary key; the
  // same value goes to `.values({ id })` and to aadFor.
  const id = randomUUID()
  const [created] = await mapBarcodeConflict(() => db
    .insert(invoiceCredentials)
    .values({
      id,
      groupId: group.id,
      userId: user.id,
      barcode: validated.barcode,
      verificationCodeEncrypted: encrypt(validated.verificationCode, aadFor('InvoiceCredentials', 'verification_code_encrypted', id)),
      nickname: validated.nickname,
      status: 'active',
    })
    .returning({ id: invoiceCredentials.id }))

  revalidateSettings()
  return { id: created.id }
})

/**
 * Rename an existing credential. Only the nickname field is mutable in place
 * — barcode is immutable (delete + recreate to swap). Throws if the row is
 * missing, soft-deleted, or owned by someone else.
 */
export const renameInvoiceCredential = action(async (
  id: string,
  nickname: string | null,
): Promise<void> => {
  const { user, group } = await requireViewerGroup()

  let trimmed: string | null = null
  if (nickname !== null && nickname !== undefined) {
    const t = nickname.trim()
    if (t.length > 16) throw actionError('invoice_nickname_too_long')
    trimmed = t.length > 0 ? t : null
  }

  const updated = await db
    .update(invoiceCredentials)
    .set({ nickname: trimmed })
    .where(and(
      eq(invoiceCredentials.id, id),
      eq(invoiceCredentials.groupId, group.id),
      eq(invoiceCredentials.userId, user.id),
      isNull(invoiceCredentials.deletedAt),
    ))
    .returning({ id: invoiceCredentials.id })
  if (updated.length === 0) throw actionError('invoice_carrier_not_found')

  revalidateSettings()
})

/**
 * Replace the verification code on a credential (e.g. user changed it inside
 * the 財政部 app). Atomically: soft-delete the old credential row + insert a
 * new one carrying the same barcode/nickname. The new row is freshly
 * verified before persisting; failure leaves the old row untouched.
 */
export const refreshInvoiceCredential = action(async (
  id: string,
  newVerificationCode: string,
): Promise<{ id: string }> => {
  const { user, group } = await requireViewerGroup()

  // SELECT → API verify → soft-delete → insert ALL run inside the transaction
  // so a concurrent delete cannot race between verify and the soft-delete WHERE
  // (TOCTOU). On verify failure the tx rolls back and the old row stays intact.
  const [created] = await mapBarcodeConflict(() => db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: invoiceCredentials.id,
        barcode: invoiceCredentials.barcode,
        nickname: invoiceCredentials.nickname,
        lastSyncedAt: invoiceCredentials.lastSyncedAt,
      })
      .from(invoiceCredentials)
      .where(and(
        eq(invoiceCredentials.id, id),
        eq(invoiceCredentials.groupId, group.id),
        eq(invoiceCredentials.userId, user.id),
        isNull(invoiceCredentials.deletedAt),
      ))
      .limit(1)
    if (!existing) throw actionError('invoice_carrier_not_found')

    const validated = validateInvoiceCarrierInput({
      barcode: existing.barcode,
      verificationCode: newVerificationCode,
      nickname: existing.nickname,
    })

    await verifyCarrierAgainstApi(validated.barcode, validated.verificationCode)

    // #1289 — the old row's ciphertext goes in the same UPDATE (CHECK
    // invoice_credentials_secret_iff_live rejects a soft delete that keeps it).
    const deleted = await tx
      .update(invoiceCredentials)
      .set({ deletedAt: new Date(), verificationCodeEncrypted: null })
      .where(and(
        eq(invoiceCredentials.id, id),
        eq(invoiceCredentials.groupId, group.id),
        eq(invoiceCredentials.userId, user.id),
        isNull(invoiceCredentials.deletedAt),
      ))
      .returning({ id: invoiceCredentials.id })
    if (deleted.length === 0) throw actionError('invoice_carrier_not_found')

    // #1287 — new row, new app-generated id; the AAD binds to it (never to
    // the soft-deleted row's id).
    const newId = randomUUID()
    return await tx
      .insert(invoiceCredentials)
      .values({
        id: newId,
        groupId: group.id,
        userId: user.id,
        barcode: validated.barcode,
        verificationCodeEncrypted: encrypt(validated.verificationCode, aadFor('InvoiceCredentials', 'verification_code_encrypted', newId)),
        nickname: validated.nickname,
        status: 'active',
        lastSyncedAt: existing.lastSyncedAt,
      })
      .returning({ id: invoiceCredentials.id })
  }))

  revalidateSettings()
  return { id: created.id }
})

/**
 * Soft-delete a credential. The verification ciphertext is cleared in the same
 * UPDATE (#1289; the CHECK invoice_credentials_secret_iff_live enforces it), so
 * a deleted credential never keeps the secret. The cleanup-soft-deleted cron
 * hard-deletes the row 30 days later (0069).
 */
export const deleteInvoiceCredential = action(async (id: string): Promise<void> => {
  const { user, group } = await requireViewerGroup()

  const updated = await db
    .update(invoiceCredentials)
    .set({ deletedAt: new Date(), verificationCodeEncrypted: null })
    .where(and(
      eq(invoiceCredentials.id, id),
      eq(invoiceCredentials.groupId, group.id),
      eq(invoiceCredentials.userId, user.id),
      isNull(invoiceCredentials.deletedAt),
    ))
    .returning({ id: invoiceCredentials.id })
  if (updated.length === 0) throw actionError('invoice_carrier_not_found')

  revalidateSettings()
})

/** Server-rendered list helper: rows the viewer (a single user) owns. */
export const listInvoiceCredentialsForViewer = action(async () => {
  const { user, group } = await requireViewerGroup()
  // shape kept thin so SettingsContent can render directly
  return await db
    .select({
      id: invoiceCredentials.id,
      barcode: invoiceCredentials.barcode,
      nickname: invoiceCredentials.nickname,
      status: invoiceCredentials.status,
      lastSyncedAt: invoiceCredentials.lastSyncedAt,
      createdAt: invoiceCredentials.createdAt,
    })
    .from(invoiceCredentials)
    .where(and(
      eq(invoiceCredentials.groupId, group.id),
      eq(invoiceCredentials.userId, user.id),
      isNull(invoiceCredentials.deletedAt),
    ))
})

