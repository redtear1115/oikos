/**
 * Which push tokens may be sent a ledger's "pending card due" push (#1605).
 *
 * A PushTokens row says "user U's device, registered while U was in ledger G".
 * Nothing used to move or delete that row when U left G (leaveGroup), was
 * removed from it (removePartner), or joined another ledger (acceptInvite), and
 * the sender matched tokens by `group_id` only. So a removed ex kept getting
 * G's daily push about the stayer's recurring cards. Failure looks like:
 * nothing errors; the ex's phone says 「有待確認的定期收支」 for a ledger they
 * can no longer open.
 *
 * This is the authoritative check, done at send time: a token is sent only
 * when its owner is a current `member_a` / `member_b` of the token's group.
 * It needs only the existing `group_id` FK (the PostgREST embed in index.ts),
 * not migration 0087 — 0087 stops new bad rows; this stops sending to old ones.
 *
 * Lives in its own module (imported by index.ts) because the Deno entrypoint
 * cannot be loaded under vitest; tests/push-member-tokens-1605.test.ts runs it.
 */

export interface GroupMembers {
  member_a: string | null
  member_b: string | null
}

export interface TokenRow {
  token: string
  user_id: string
  group_id: string
  // PostgREST returns a to-one embed as an object; tolerate an array (or a
  // missing embed) so a shape change fails closed instead of sending to all.
  OikosGroups: GroupMembers | GroupMembers[] | null
}

/** Tokens whose owner is a current member of the token's group, de-duplicated. */
export function tokensOfCurrentMembers(rows: readonly TokenRow[]): string[] {
  const out = new Set<string>()
  for (const row of rows) {
    const embed = Array.isArray(row.OikosGroups) ? row.OikosGroups[0] : row.OikosGroups
    if (!embed || !row.user_id) continue
    if (row.user_id === embed.member_a || row.user_id === embed.member_b) {
      out.add(row.token)
    }
  }
  return [...out]
}
