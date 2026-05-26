/**
 * Viewer ↔ member-A split-ratio conversion.
 *
 * DB column `split_ratio_a` (cashTransactions / recurringExpenseRules / oikosGroups
 * .default_split_ratio_a) is **member A's share %**. The form / UI layer
 * everywhere — labels ("我 X% / 對方 Y%"), the SplitGlyph "me" bar, the
 * `weightedSub` preview text, CompactRow's `myShare` chip — treats the value
 * as the **viewer's (me's) share %**.
 *
 * For viewer = member A the two semantics coincide and the bug stays hidden;
 * for viewer = member B they invert. Without a flip at every UI/DB boundary,
 * B's intent of "我 90%" gets stored as `split_ratio_a = 90` (semantically
 * A=90%, so B=10% — the opposite) and balance calc / row display read the
 * value back as A's % per schema, surfacing wrong amounts and wrong direction
 * in the per-record preview text.
 *
 * Use `toViewerShare` when bringing a DB value into the UI; use `toMemberAShare`
 * when sending a UI value back to the DB. The mapping is an involution
 * (`f(f(x)) === x`) — both functions share an implementation — but the named
 * call-sites document direction at the boundary.
 */
export function toViewerShare(memberAShare: number, viewerIsA: boolean): number {
  return viewerIsA ? memberAShare : 100 - memberAShare
}

export function toMemberAShare(viewerShare: number, viewerIsA: boolean): number {
  return viewerIsA ? viewerShare : 100 - viewerShare
}
