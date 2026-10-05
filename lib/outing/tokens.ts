import { createHash, randomBytes } from 'crypto'
import { aadFor, decrypt, encrypt } from '@/lib/crypto'

/**
 * Tokens for 出遊．朋友從分享連結加入 (#1558): the outing's share link and a
 * participant's claim cookie. Server-only.
 *
 * Neither token is ever stored in plaintext (drizzle/0082_outing_link_join.sql):
 *   * Lookup is by `hashToken` — sha256 hex in Outings.share_token_hash /
 *     OutingParticipants.claim_token_hash, each under a partial unique index.
 *   * The share token is also kept as lib/crypto ciphertext so a member can
 *     re-display the link they already shared. The AAD binds it to the outing
 *     row (`v1|Outings.share_token_encrypted|<outing id>`), so a value copied
 *     to another outing does not decrypt. The claim token has no ciphertext:
 *     it lives only in the claimant's cookie.
 *
 * Failure looks like: decrypting with any id other than the row's own throws
 * CryptoError, which reaches the client as the generic unexpected-error
 * digest ("copy link" fails with no specific message). Pass the id of the row
 * the ciphertext was read from.
 */

/** 32 random bytes → 43 base64url chars (256 bits). */
const TOKEN_BYTES = 32
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/

/** A fresh share or claim token: 256 random bits, base64url without padding. */
export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url')
}

/**
 * Shape check before any lookup, so a malformed link or cookie is rejected
 * without touching the DB (and without hashing attacker-sized input).
 */
export function isWellFormedToken(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_RE.test(token)
}

/** sha256 hex of a token: the value stored and looked up. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** Ciphertext for Outings.share_token_encrypted, bound to `outingId`. */
export function encryptShareToken(token: string, outingId: string): string {
  return encrypt(token, aadFor('Outings', 'share_token_encrypted', outingId))
}

/**
 * Plaintext share token from Outings.share_token_encrypted. `outingId` must be
 * the id of the row the ciphertext was read from; anything else throws
 * CryptoError.
 */
export function decryptShareToken(ciphertext: string, outingId: string): string {
  return decrypt(ciphertext, aadFor('Outings', 'share_token_encrypted', outingId))
}
