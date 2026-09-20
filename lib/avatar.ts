/**
 * #1328 — single helper for the "avatarHidden ⇒ null avatarUrl" rule, used
 * at every JS-side choke point that builds a member-facing shape from a
 * `profiles` row (dashboard layout's MemberContextValue, settings page's
 * viewer/partner props). Query-level reads that can't reach into JS (raw
 * `sql` CASE expressions in `review/[month]` and `lib/db/queries/asset.ts`)
 * duplicate the same rule at the SQL layer instead — see those call sites.
 */
export function maskAvatarUrl(profile: { avatarUrl: string | null; avatarHidden: boolean }): string | null {
  return profile.avatarHidden ? null : (profile.avatarUrl ?? null)
}
