'use client'

import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import {
  checkAndroidFcmGate,
  registerPushToken,
  type FcmShellGate,
  type PushRegisterOutcome,
} from '@/lib/pushNotifications'
import { clearStoredPushToken, readStoredPushToken } from '@/lib/pushTokenStorage'

/**
 * Development-only (#968 S4c). Rendered by app/dev/push-gate/page.tsx, which
 * 404s outside `next dev`. Imports only the push module under test and the
 * token storage it already writes: no server actions, no database client.
 *
 * Runs once per page load. On a denied gate it never touches
 * PushNotifications (that is the E-old evidence: no prompt, no crash, no
 * `register` in logcat), so the `registrationError` listener is only added
 * after `registerPushToken` reports it is registering.
 */
export function PushGateProbe({ userId, groupId }: { userId: string; groupId: string }) {
  const started = useRef(false)
  const [platform, setPlatform] = useState<string>('…')
  const [gate, setGate] = useState<FcmShellGate | 'n/a' | null>(null)
  const [outcome, setOutcome] = useState<PushRegisterOutcome | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [nativeError, setNativeError] = useState<string | null>(null)

  useEffect(() => {
    if (started.current) return
    started.current = true

    const native = Capacitor.isNativePlatform()
    const name = Capacitor.getPlatform()
    setPlatform(`${name}${native ? ' (native)' : ''}`)
    // A token left over from an earlier run would look like a fresh success.
    clearStoredPushToken()

    void (async () => {
      setGate(native && name === 'android' ? await checkAndroidFcmGate() : 'n/a')
      try {
        const result = await registerPushToken(userId, groupId)
        setOutcome(result)
        if (result === 'registering') {
          void PushNotifications.addListener('registrationError', (e) => {
            setNativeError(String(e?.error ?? 'unknown'))
          })
        }
      } catch (e) {
        setFailure(e instanceof Error ? e.message : String(e))
      }
    })()

    // The real `registration` listener stores the token; show a prefix only.
    const timer = setInterval(() => {
      const stored = readStoredPushToken()
      if (stored) {
        setToken(`${stored.slice(0, 8)}… (${stored.length} chars)`)
        clearInterval(timer)
      }
    }, 1000)
    setTimeout(() => clearInterval(timer), 60_000)
  }, [userId, groupId])

  const gateText =
    gate === null ? '…'
      : gate === 'n/a' ? 'n/a (not an Android shell)'
        : gate.allowed ? `allowed (shell ${gate.version})`
          : `denied: ${gate.reason}${gate.version !== undefined ? ` (shell "${gate.version}")` : ''}`

  const rows: [string, string][] = [
    ['platform', platform],
    ['gate', gateText],
    ['registerPushToken', failure ? `threw: ${failure}` : outcome ?? '…'],
    ['token', token ?? 'none yet'],
    ['registrationError', nativeError ?? 'none'],
  ]

  return (
    <main className="min-h-dvh px-5 py-12 bg-bg text-ink">
      <h1 className="text-lg mb-4">push gate probe (dev only)</h1>
      <dl className="text-sm font-mono">
        {rows.map(([label, value]) => (
          <div key={label} className="py-2 border-b border-hairline">
            <dt className="text-ink-3">{label}</dt>
            <dd data-probe={label}>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-ink-3 mt-4">
        userId {userId} · groupId {groupId}
      </p>
    </main>
  )
}
