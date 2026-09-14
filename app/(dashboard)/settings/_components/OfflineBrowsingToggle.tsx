'use client'

import { useEffect, useState } from 'react'
import { Switch } from '@/components/Switch'
import { getOfflinePref, setOfflinePref } from '@/lib/offline/preference'
import {
  clearAllCaches,
  hasActiveSW,
  isSWSupported,
  registerSW,
  unregisterAllSW,
} from '@/lib/offline/swControl'
import { useTranslations } from '@/lib/i18n/client'

export function OfflineBrowsingToggle() {
  const t = useTranslations()
  const [enabled, setEnabled] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [supported, setSupported] = useState(true)

  // Calibrate UI to the actual SW state on mount: trust the registration over
  // localStorage (handles "user manually cleared storage" + "previous toggle
  // failed mid-flight" cases).
  useEffect(() => {
    if (!isSWSupported()) {
      setSupported(false)
      return
    }
    let cancelled = false
    void (async () => {
      const active = await hasActiveSW()
      const stored = getOfflinePref()
      const real = active || stored
      if (cancelled) return
      setEnabled(real)
      // Resync localStorage to the truth so other tabs / banner agree.
      if (real !== stored) setOfflinePref(real)
    })()
    return () => { cancelled = true }
  }, [])

  const handleToggle = async (next: boolean) => {
    if (pending) return
    setError(null)
    setPending(true)
    try {
      if (next) {
        await registerSW()
        setOfflinePref(true)
        setEnabled(true)
      } else {
        // Order matters: write pref first so a concurrent banner read sees OFF
        // before caches disappear, then unregister + wipe storage.
        setOfflinePref(false)
        await unregisterAllSW()
        await clearAllCaches()
        setEnabled(false)
      }
    } catch {
      setError(t.settings.offlineToggleError)
      // Roll back any optimistic UI: re-read truth.
      const active = await hasActiveSW()
      setEnabled(active)
      setOfflinePref(active)
    } finally {
      setPending(false)
    }
  }

  if (!supported) {
    return (
      <div
        className="rounded-card flex items-center px-5 py-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
      >
        <div className="flex-1 min-w-0 pr-4">
          <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            {t.settings.offlineBrowsing}
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
            {t.settings.offlineUnsupported}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div
        className="rounded-card flex items-center justify-between px-5 py-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
      >
        <div className="flex-1 min-w-0 pr-4">
          <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            {t.settings.offlineBrowsing}
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
            {pending
              ? t.settings.offlineToggling
              : enabled
                ? t.settings.offlineHintOn
                : t.settings.offlineHintOff}
          </div>
        </div>
        <Switch
          checked={enabled}
          onChange={handleToggle}
          ariaLabel={t.settings.offlineBrowsing}
          disabled={pending}
        />
      </div>
      {error && (
        <div className="text-xs mt-2 px-1" style={{ color: 'var(--debit)' }}>
          {error}
        </div>
      )}
    </div>
  )
}
