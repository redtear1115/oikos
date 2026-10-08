import { clearStoredPushToken, readStoredPushToken } from '@/lib/pushTokenStorage'

/** How long sign-out waits for the push-row delete before going ahead. */
export const UNREGISTER_TIMEOUT_MS = 2000

interface Deps {
  /** Removes this device's PushTokens row for the signed-in user. */
  unregister: (token: string) => Promise<unknown>
  /** The real sign-out (server action that clears the session and redirects). */
  signOut: () => Promise<unknown>
  timeoutMs?: number
}

/**
 * Sign-out for LogoutButton (#1605 F11): drop this device's push registration,
 * then sign out exactly as before.
 *
 * Order matters. The delete runs while the session still exists (the server
 * action needs it to know whose row to drop), and it can never hold sign-out
 * up: it gets {@link UNREGISTER_TIMEOUT_MS} and any failure — thrown, rejected,
 * `{ ok: false }`, or simply slow — is swallowed. Failure looks like (if this
 * is reordered or the swallow removed): tapping 登出 hangs on a bad network,
 * or does nothing at all when the delete errors. The stored token is cleared
 * last, so a sign-out that fails leaves it for the next try.
 */
export async function signOutThisDevice({ unregister, signOut, timeoutMs = UNREGISTER_TIMEOUT_MS }: Deps): Promise<void> {
  const token = readStoredPushToken()
  if (token) {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        Promise.resolve().then(() => unregister(token)),
        new Promise<void>((resolve) => { timer = setTimeout(resolve, timeoutMs) }),
      ])
    } catch {
      // Best-effort; sign-out goes ahead regardless.
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }
  await signOut().catch(() => {})
  clearStoredPushToken()
}
