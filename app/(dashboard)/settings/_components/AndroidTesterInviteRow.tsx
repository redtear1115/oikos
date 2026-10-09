'use client'

import { useEffect, useRef, useState } from 'react'
import { getCapacitorPlatform } from '@/components/KofiWidget'
import { track } from '@/lib/analytics/track'
import { useLocale, useTranslations } from '@/lib/i18n/client'
import { isLocale } from '@/lib/i18n/locales-meta'
import { localizedHref } from '@/lib/i18n/path'
import { APP_URL } from '@/lib/i18n/seo'
import { ANDROID_BETA_PATH, ANDROID_TEST_GROUP_URL } from '@/lib/visitorPlatform'

/**
 * Settings row that shares the /android-beta join page with a partner or
 * friend who uses Android (#1648). The shared URL is the clean join page in
 * the viewer's locale, with no attribution params.
 *
 * Apple Guideline 2.3.10: the iOS app must not mention other mobile platforms,
 * so the row is hidden inside the iOS shell. Everywhere else it shows (Android
 * shell, any browser, PWA): an iPhone user is the likeliest person to know an
 * Android tester. The gate is runtime (see KofiWidget): one deployment serves
 * all shells. Failure looks like: the row appearing inside the iOS app, with no
 * error, and surfacing only in App Review. Nothing renders before mount so SSR
 * and the first client render agree. Hidden when the group URL is empty, so we
 * never share a page with no action.
 *
 * Share: `navigator.share` when present, else (or on a non-Abort rejection)
 * the clipboard plus an inline confirmation. `@capacitor/share` is not a
 * dependency and adding it would touch the native projects, so inside the
 * Android shell, whose WebView has no Web Share API, the clipboard path is the
 * path. User cancel (AbortError) does nothing.
 *
 * TEMPORARY: removed with the Android closed-test cleanup (#1553), together
 * with the `androidTesterInvite` i18n namespace and `android_beta_share_clicked`.
 */
export function AndroidTesterInviteRow() {
  const t = useTranslations()
  const raw = useLocale()
  const locale = isLocale(raw) ? raw : 'zh-TW'
  const [show, setShow] = useState(false)
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setShow(!!ANDROID_TEST_GROUP_URL && getCapacitorPlatform() !== 'ios')
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  if (!show) return null

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      return
    }
    track('android_beta_share_clicked', { method: 'copy' })
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 2000)
  }

  const handleClick = async () => {
    const url = `${APP_URL}${localizedHref(ANDROID_BETA_PATH, locale)}`
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: t.androidTesterInvite.shareTitle, text: t.androidTesterInvite.shareText, url })
        track('android_beta_share_clicked', { method: 'share' })
        return
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return
      }
    }
    await copy(url)
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={handleClick}
        className="w-full flex items-center justify-between px-5 py-4 rounded-card text-left bg-transparent cursor-pointer"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
      >
        <div className="flex flex-col min-w-0">
          <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            {t.androidTesterInvite.title}
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
            {copied ? t.androidTesterInvite.copied : t.androidTesterInvite.hint}
          </div>
        </div>
        <div className="text-sm flex items-center gap-2 shrink-0" style={{ color: 'var(--ink-3)' }}>
          <span aria-hidden="true">›</span>
        </div>
      </button>
    </div>
  )
}
