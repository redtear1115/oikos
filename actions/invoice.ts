'use server'

import { db } from '@/lib/db/client'
import { invoiceCredentials, oikosGroups } from '@/lib/db/schema'
import { createClient } from '@/lib/supabase/server'
import {
  validateInvoiceCarrierInput,
  type InvoiceCarrierInput,
} from '@/lib/validators'
import { encrypt } from '@/lib/crypto'
import { fetchInvoicesByCarrier } from '@/lib/invoice/api'
import { and, eq, isNull, or } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

/**
 * v0.9.0 Phase A — credential CRUD only.
 * Phase B will add previewInvoiceImport / commitInvoiceImport here.
 *
 * Conventions (mirror actions/income.ts):
 *   - All mutations open a single supabase auth check + group lookup.
 *   - Edits use soft-delete + insert atomically (DB-level UPDATE is forbidden
 *     for user-mutable fields; status / lastSyncedAt are server-only metadata
 *     and may be UPDATEd in place).
 */

async function getViewerGroup() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const [group] = await db
    .select()
    .from(oikosGroups)
    .where(or(eq(oikosGroups.memberA, user.id), eq(oikosGroups.memberB, user.id)))
    .limit(1)
  if (!group) throw new Error('找不到家計簿')

  return { user, group }
}

function mapMofErrorToMessage(code: string): string {
  switch (code) {
    case '919': return '條碼或驗證碼有誤，請確認'
    case '953': return '服務暫時無法使用，稍後再試'
    case '998': return '服務暫時無法使用，稍後再試'
    default:    return `驗證失敗（${code}）`
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
    throw new Error(mapMofErrorToMessage(result.code))
  }
}

export interface CreateInvoiceCredentialInput extends InvoiceCarrierInput {}

/**
 * Bind a new mobile-barcode carrier to the viewer's group. Validates input,
 * runs a verification round-trip against the API (mock in Phase A), encrypts
 * the verification code, and persists the row.
 */
export async function createInvoiceCredential(
  input: CreateInvoiceCredentialInput,
): Promise<{ id: string }> {
  const validated = validateInvoiceCarrierInput(input)
  const { user, group } = await getViewerGroup()

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
  if (existing) throw new Error('此條碼已綁定')

  await verifyCarrierAgainstApi(validated.barcode, validated.verificationCode)

  const [created] = await db
    .insert(invoiceCredentials)
    .values({
      groupId: group.id,
      userId: user.id,
      barcode: validated.barcode,
      verificationCodeEncrypted: encrypt(validated.verificationCode),
      nickname: validated.nickname,
      status: 'active',
    })
    .returning({ id: invoiceCredentials.id })

  revalidatePath('/settings')
  return { id: created.id }
}

/**
 * Rename an existing credential. Only the nickname field is mutable in place
 * — barcode is immutable (delete + recreate to swap). Throws if the row is
 * missing, soft-deleted, or owned by someone else.
 */
export async function renameInvoiceCredential(
  id: string,
  nickname: string | null,
): Promise<void> {
  const { user, group } = await getViewerGroup()

  let trimmed: string | null = null
  if (nickname !== null && nickname !== undefined) {
    const t = nickname.trim()
    if (t.length > 16) throw new Error('暱稱最長 16 字')
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
  if (updated.length === 0) throw new Error('找不到該載具')

  revalidatePath('/settings')
}

/**
 * Replace the verification code on a credential (e.g. user changed it inside
 * the 財政部 app). Atomically: soft-delete the old credential row + insert a
 * new one carrying the same barcode/nickname. The new row is freshly
 * verified before persisting; failure leaves the old row untouched.
 */
export async function refreshInvoiceCredential(
  id: string,
  newVerificationCode: string,
): Promise<{ id: string }> {
  const { user, group } = await getViewerGroup()

  // Ensure we own the row first (cheap + lets us copy fields over).
  const [existing] = await db
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
  if (!existing) throw new Error('找不到該載具')

  // Re-validate the new code shape using the shared helper. Reuse the existing
  // barcode (always valid since it came from DB).
  const validated = validateInvoiceCarrierInput({
    barcode: existing.barcode,
    verificationCode: newVerificationCode,
    nickname: existing.nickname,
  })

  await verifyCarrierAgainstApi(validated.barcode, validated.verificationCode)

  const [created] = await db.transaction(async (tx) => {
    const deleted = await tx
      .update(invoiceCredentials)
      .set({ deletedAt: new Date() })
      .where(and(
        eq(invoiceCredentials.id, id),
        eq(invoiceCredentials.groupId, group.id),
        eq(invoiceCredentials.userId, user.id),
        isNull(invoiceCredentials.deletedAt),
      ))
      .returning({ id: invoiceCredentials.id })
    if (deleted.length === 0) throw new Error('找不到該載具')

    return await tx
      .insert(invoiceCredentials)
      .values({
        groupId: group.id,
        userId: user.id,
        barcode: validated.barcode,
        verificationCodeEncrypted: encrypt(validated.verificationCode),
        nickname: validated.nickname,
        status: 'active',
        lastSyncedAt: existing.lastSyncedAt,
      })
      .returning({ id: invoiceCredentials.id })
  })

  revalidatePath('/settings')
  return { id: created.id }
}

/**
 * Soft-delete a credential. The verification ciphertext stays encrypted in
 * the row until the cleanup-soft-deleted cron physically purges after 1y.
 */
export async function deleteInvoiceCredential(id: string): Promise<void> {
  const { user, group } = await getViewerGroup()

  const updated = await db
    .update(invoiceCredentials)
    .set({ deletedAt: new Date() })
    .where(and(
      eq(invoiceCredentials.id, id),
      eq(invoiceCredentials.groupId, group.id),
      eq(invoiceCredentials.userId, user.id),
      isNull(invoiceCredentials.deletedAt),
    ))
    .returning({ id: invoiceCredentials.id })
  if (updated.length === 0) throw new Error('找不到該載具')

  revalidatePath('/settings')
}

/** Server-rendered list helper: rows the viewer (a single user) owns. */
export async function listInvoiceCredentialsForViewer() {
  const { user, group } = await getViewerGroup()
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
}

