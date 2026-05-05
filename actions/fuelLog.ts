'use server'

import { db } from '@/lib/db/client'
import { assets, cashTransactions, fuelLogs, oikosGroups } from '@/lib/db/schema'
import { createClient } from '@/lib/supabase/server'
import { recalcGroupBalance } from '@/lib/db/queries/balance'
import { validateFuelLogInput, type FuelLogInputRaw } from '@/lib/validators'
import { eq, or, and } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

/**
 * Atomic dual-write for a new fuel-up event:
 *   FuelLog (the canonical record) + CashTransaction (with fuelLogId FK)
 *   + recalcGroupBalance — all inside one DB transaction.
 *
 * Description is auto-generated: '加油 · {station}' if station present, else '加油'.
 * paidBy / splitType are taken from form input (Q4 B1 — user picks per-fill).
 */
export async function createFuelLog(input: FuelLogInputRaw): Promise<{ id: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  // Validate input first (rejects fuelType=electric per EV1, etc.) — runs before any DB hit.
  const validated = validateFuelLogInput(input)

  // Find viewer's group
  const [group] = await db
    .select()
    .from(oikosGroups)
    .where(or(eq(oikosGroups.memberA, user.id), eq(oikosGroups.memberB, user.id)))
    .limit(1)
  if (!group) throw new Error('找不到家計簿')

  // Asset must belong to the viewer's group and not be soft-deleted.
  const [asset] = await db
    .select({ id: assets.id, deletedAt: assets.deletedAt })
    .from(assets)
    .where(and(
      eq(assets.id, validated.assetId),
      eq(assets.groupId, group.id),
      eq(assets.type, 'car'),
    ))
    .limit(1)
  if (!asset) throw new Error('關聯資產不在家計簿內')
  if (asset.deletedAt) throw new Error('關聯資產已刪除')

  // Payer must be a current group member.
  if (validated.paidBy !== group.memberA && validated.paidBy !== group.memberB) {
    throw new Error('付款人不在家計簿內')
  }

  const description = validated.station ? `加油 · ${validated.station}` : '加油'

  const result = await db.transaction(async (tx) => {
    const [newLog] = await tx
      .insert(fuelLogs)
      .values({
        assetId: validated.assetId,
        // Drizzle numeric column: pass as string with fixed precision so
        // 36.2 doesn't round-trip as 36.19999...
        liters: validated.liters.toFixed(2),
        fuelType: validated.fuelType,
        odometer: validated.odometer,
        station: validated.station,
        loggedAt: validated.loggedAt,
      })
      .returning({ id: fuelLogs.id })

    const [newTxn] = await tx
      .insert(cashTransactions)
      .values({
        groupId: group.id,
        assetId: validated.assetId,
        fuelLogId: newLog.id,
        paidBy: validated.paidBy,
        amount: validated.cost,
        splitType: validated.splitType,
        category: 'transit',
        description,
        transactedAt: validated.loggedAt,
      })
      .returning({ id: cashTransactions.id })

    await recalcGroupBalance(group.id, tx)

    return { id: newLog.id, txnId: newTxn.id }
  })

  revalidatePath('/dashboard')
  revalidatePath('/records')
  revalidatePath(`/assets/${validated.assetId}`)

  return { id: result.id }
}
