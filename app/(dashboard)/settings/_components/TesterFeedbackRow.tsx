'use client'

import { useEffect, useState } from 'react'
import { track } from '@/lib/analytics/track'
import { useTranslations } from '@/lib/i18n/client'
import { detectPlatform } from '@/lib/platform'

/** The Play listing, where Play's private feedback for testers lives (#1648). */
export const PLAY_LISTING_URL = 'https://play.google.com/store/apps/details?id=dev.southernlight.futari'

/**
 * Settings row that sends Android-shell testers to the Play listing to leave
 * private feedback (#1648). Shown only inside the Android shell; nothing until
 * mounted so SSR and the first client render agree (same pattern as SupportRow).
 *
 * Capacitor-aware web code: it reaches every installed Android shell the moment
 * it deploys, so check it in a real shell, not just a browser.
 *
 * Why a plain link opens OUTSIDE the WebView: `BridgeWebViewClient
 * .shouldOverrideUrlLoading` (@capacitor/android …/getcapacitor/BridgeWebViewClient.java:27-30)
 * hands every navigation to `Bridge.launchIntent` (Bridge.java:389-427), which
 * sends any URL whose host differs from `server.url`'s (and is not in
 * `server.allowNavigation`, deliberately unset, capacitor.config.ts) to
 * `startActivity(ACTION_VIEW)` and returns true, so the WebView never navigates.
 * play.google.com/store/apps/details therefore opens in the Play Store app (or
 * the system browser). The same path serves SupportRow's Ko-fi link. Neither
 * BridgeWebChromeClient nor the app overrides `onCreateWindow` (grep finds none),
 * so `target="_blank"` also lands in `shouldOverrideUrlLoading`. If this ever
 * regresses the failure is silent: the tap replaces the app with a Play page
 * inside the WebView, and Back is the only way out.
 *
 * TEMPORARY: removed with the Android closed-test cleanup (#1553), together
 * with the `testerFeedback` i18n namespace and `tester_feedback_clicked`.
 */
export function TesterFeedbackRow() {
  const t = useTranslations()
  const [show, setShow] = useState(false)

  useEffect(() => {
    setShow(detectPlatform() === 'android_native')
  }, [])

  if (!show) return null

  return (
    <div className="mt-3">
      <a
        href={PLAY_LISTING_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track('tester_feedback_clicked')}
        className="w-full flex items-center justify-between px-5 py-4 rounded-card text-left bg-transparent cursor-pointer"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
      >
        <div className="flex flex-col min-w-0">
          <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            {t.testerFeedback.title}
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
            {t.testerFeedback.hint}
          </div>
        </div>
        <div className="text-sm flex items-center gap-2 shrink-0" style={{ color: 'var(--ink-3)' }}>
          <span aria-hidden="true">›</span>
        </div>
      </a>
    </div>
  )
}
