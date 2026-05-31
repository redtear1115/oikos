'use client'

import { useEffect, useState } from 'react'
import { isInAppBrowser, isIos } from '@/lib/in-app-browser'

interface Strings {
  title: string
  description: string
  urlLabel: string
  copy: string
  copied: string
  openInSafari: string
  instructionGeneric: string
  instructionIos: string
  instructionAndroid: string
}

type Mode = 'ios' | 'android' | 'other'

/**
 * Full-screen blocker shown when the user opens Futari from an in-app
 * WebView (LINE / Instagram / FB / WeChat / Telegram / Threads). These
 * browsers break Google OAuth and the Service Worker, so we don't try
 * to render the app — we just tell the user to open it elsewhere.
 *
 * Strings come in as a prop because the root layout has no
 * TranslationsProvider above it.
 */
export function InAppBrowserGuard({ strings }: { strings: Strings }) {
  const [show, setShow] = useState(false)
  const [mode, setMode] = useState<Mode>('other')
  const [url, setUrl] = useState('')

  useEffect(() => {
    if (typeof navigator === 'undefined') return
    const ua = navigator.userAgent
    if (!isInAppBrowser(ua)) return
    setShow(true)
    setMode(isIos(ua) ? 'ios' : /Android/i.test(ua) ? 'android' : 'other')
    setUrl(window.location.href)
  }, [])

  if (!show) return null

  return <Blocker strings={strings} mode={mode} url={url} />
}

function Blocker({ strings, mode, url }: { strings: Strings; mode: Mode; url: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Some in-app browsers block clipboard. Fall back to selecting the URL
      // so the user can long-press → copy manually.
    }
  }

  const handleOpenInSafari = () => {
    // x-safari-https:// — undocumented iOS scheme that hands a URL to
    // Safari. Works in most in-app WebViews on iOS; harmless if it
    // doesn't (the WebView shows nothing, user falls back to copy).
    const safariUrl = url.replace(/^https?:\/\//, 'x-safari-https://')
    window.location.href = safariUrl
  }

  const instruction =
    mode === 'ios' ? strings.instructionIos : mode === 'android' ? strings.instructionAndroid : strings.instructionGeneric

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="in-app-guard-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center px-6"
      style={{ background: 'var(--bg, #FBEDE0)' }}
    >
      <div className="w-full max-w-md flex flex-col items-center text-center">
        <BrowserIcon />

        <h1
          id="in-app-guard-title"
          className="mt-6 text-xl font-medium leading-tight"
          style={{ color: 'var(--ink, #3A2419)' }}
        >
          {strings.title}
        </h1>

        <p
          className="mt-4 text-sm leading-relaxed"
          style={{ color: 'var(--ink-2, #7A5848)' }}
        >
          {strings.description}
        </p>

        <div
          className="mt-6 w-full rounded-2xl p-4 flex flex-col gap-3"
          style={{
            background: 'var(--surface, #FFFFFF)',
            border: '1px solid var(--hairline, rgba(58,36,25,0.10))',
          }}
        >
          <div
            className="text-xs uppercase tracking-wide font-medium text-left"
            style={{ color: 'var(--ink-3, #B89C8B)' }}
          >
            {strings.urlLabel}
          </div>
          <div
            className="text-xs break-all text-left"
            style={{ color: 'var(--ink-2, #7A5848)' }}
          >
            {url}
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="h-11 rounded-xl border-0 text-sm font-medium cursor-pointer w-full"
            style={{
              background: 'var(--ink, #3A2419)',
              color: 'var(--on-fill)',
            }}
          >
            {copied ? strings.copied : strings.copy}
          </button>
        </div>

        {mode === 'ios' && (
          <button
            type="button"
            onClick={handleOpenInSafari}
            className="mt-3 h-11 rounded-xl text-sm font-medium cursor-pointer w-full"
            style={{
              background: 'transparent',
              color: 'var(--ink, #3A2419)',
              border: '1px solid var(--ink, #3A2419)',
            }}
          >
            {strings.openInSafari}
          </button>
        )}

        <p
          className="mt-5 text-xs leading-relaxed"
          style={{ color: 'var(--ink-2, #7A5848)' }}
        >
          {instruction}
        </p>
      </div>
    </div>
  )
}

function BrowserIcon() {
  return (
    <svg
      width="56"
      height="56"
      viewBox="0 0 56 56"
      fill="none"
      aria-hidden="true"
      style={{ color: 'var(--accent, #E08856)' }}
    >
      <circle cx="28" cy="28" r="22" stroke="currentColor" strokeWidth="2.5" />
      <path d="M6 28h44" stroke="currentColor" strokeWidth="2.5" />
      <path
        d="M28 6c5.5 6 8.5 13.5 8.5 22S33.5 44 28 50C22.5 44 19.5 36.5 19.5 28S22.5 12 28 6z"
        stroke="currentColor"
        strokeWidth="2.5"
      />
    </svg>
  )
}
