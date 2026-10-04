/**
 * Why Supabase refused a native Apple identity token, as a fixed label (#1552).
 *
 * GoTrue answers every id_token rejection the same way — `AuthApiError`, status
 * 400, `code` undefined — so name / status / code cannot tell a nonce problem
 * from a wrong audience. Only the message can, and the message must not leave
 * the device: the audience variant echoes the token's `aud` claim back. So the
 * message is read here, on the device, and only the label is sent.
 *
 * The patterns are GoTrue's literal strings (`internal/api/token_oidc.go`).
 * If GoTrue rewords one, that cause silently moves to `'other'` — the failure
 * looks like the label distribution shifting, not like an error.
 */
export type IdTokenErrorLabel = 'nonce_mismatch' | 'audience' | 'bad_id_token' | 'nonce_missing' | 'other'

export function idTokenErrorLabel(message: unknown): IdTokenErrorLabel {
  const text = typeof message === 'string' ? message : ''
  if (/nonces mismatch/i.test(text)) return 'nonce_mismatch'
  if (/unacceptable audience/i.test(text)) return 'audience'
  // "Passed nonce and nonce in id_token should either both exist or not."
  if (/nonce.*should either both exist or not/i.test(text) || /missing nonce|nonce (is )?missing/i.test(text)) {
    return 'nonce_missing'
  }
  if (/bad id token/i.test(text)) return 'bad_id_token'
  return 'other'
}
