// Back-compat re-export shim (#512 PR 1). The membership + asset assertion
// helpers moved to `@/lib/auth/member` and `@/lib/auth/asset` so all write
// actions can share the same auth gate alongside `requireViewerGroup` (#190).
// `recurringExpense.ts` / `recurringIncome.ts` still import from this path —
// next cleanup will switch them over and delete this shim.
export { assertMemberInGroup } from '@/lib/auth/member'
export { assertAssetInGroup } from '@/lib/auth/asset'
