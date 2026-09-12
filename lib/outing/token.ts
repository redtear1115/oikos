import { randomBytes } from 'node:crypto'

// URL-safe random token (base64url, no padding). 24 bytes → 32 chars.
function urlSafeToken(bytes = 24): string {
  return randomBytes(bytes).toString('base64url')
}

/** Unguessable token embedded in the outing share link (`/outing/<token>`). */
export function generateShareToken(): string {
  return urlSafeToken(24)
}

/** Per-participant secret: lets a holder act as / claim that slot. */
export function generateClaimToken(): string {
  return urlSafeToken(24)
}
