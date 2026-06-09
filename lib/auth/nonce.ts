/**
 * Apple Sign-In nonce helpers.
 *
 * Apple requires replay protection: we generate a random `rawNonce`, pass its
 * SHA-256 hex digest to Apple's authorize call, and hand the *raw* value to
 * Supabase `signInWithIdToken`. Supabase re-hashes and compares against the
 * `nonce` claim Apple embeds in the returned identity token.
 */

/** A random 32-byte value as a 64-char hex string. */
export function generateNonce(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** SHA-256 of `input` as a lowercase hex string. */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')
}
