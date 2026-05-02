import { sql } from 'drizzle-orm'
import type { PgTransaction } from 'drizzle-orm/pg-core'
import { db } from '@/lib/db/client'

/**
 * Recompute and persist GroupBalance from active transactions + settlements.
 * MUST be called within the same DB transaction as any mutating write.
 * Pass `tx` if running inside a Drizzle transaction; falls back to `db` otherwise.
 */
export async function recalcGroupBalance(
  groupId: string,
  tx: typeof db | PgTransaction<any, any, any> = db,
): Promise<void> {
  await tx.execute(sql`
    UPDATE "GroupBalance"
    SET balance = (
      SELECT COALESCE(SUM(
        CASE
          WHEN paid_by = (SELECT member_a FROM "OikosGroups" WHERE id = ${groupId})
            THEN CASE split_type
              WHEN 'all_mine'   THEN 0
              WHEN 'all_theirs' THEN amount
              WHEN 'half'       THEN CEIL(amount / 2.0)::int
            END
          ELSE CASE split_type
              WHEN 'all_mine'   THEN 0
              WHEN 'all_theirs' THEN -amount
              WHEN 'half'       THEN -CEIL(amount / 2.0)::int
            END
        END
      ), 0)
      FROM "CashTransactions"
      WHERE group_id = ${groupId} AND deleted_at IS NULL
    ) + (
      -- Settlement deltas (matches lib/balance.ts settlementDelta):
      -- paid_by = member_a (A paid B) → +amount (B now indebted to A)
      -- paid_by = member_b (B paid A) → -amount (A now indebted to B)
      SELECT COALESCE(SUM(
        CASE
          WHEN paid_by = (SELECT member_a FROM "OikosGroups" WHERE id = ${groupId}) THEN amount
          ELSE -amount
        END
      ), 0)
      FROM "Settlements"
      WHERE group_id = ${groupId} AND deleted_at IS NULL
    ),
    version = version + 1,
    last_calculated_at = NOW()
    WHERE group_id = ${groupId};
  `)
}

export async function getGroupBalance(groupId: string): Promise<number> {
  const rows = await db.execute<{ balance: number }>(sql`
    SELECT balance FROM "GroupBalance" WHERE group_id = ${groupId} LIMIT 1
  `)
  return rows[0]?.balance ?? 0
}
