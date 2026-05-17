/**
 * Assert that `memberId` belongs to the given two-member group. Throws with the
 * caller-supplied message when the id matches neither member slot. Used by all
 * write actions (transaction / income / settlement / tripExpense / recurring*)
 * to validate the payer / recipient / payee against the active group.
 *
 * Lives under `lib/auth/` alongside `lib/auth/viewer.ts` because this is an
 * authorization gate (write target must be one of the two seats), not a
 * domain helper.
 */
export function assertMemberInGroup(
  memberId: string,
  group: { memberA: string; memberB: string | null },
  errorMessage: string,
): void {
  if (memberId !== group.memberA && memberId !== group.memberB) {
    throw new Error(errorMessage)
  }
}
