'use client'

import { useEffect, useState } from 'react'
import { SheetBackdrop } from '@/app/(dashboard)/dashboard/_components/SheetBackdrop'
import { getPlatform, type Platform } from '@/lib/install-guide'

interface Props {
  open: boolean
  onClose: () => void
}

/**
 * Platform-aware bottom sheet that walks the user through "Add to Home Screen".
 * Used in two places:
 *   1. Auto-shown after first /setup completion (if not already a PWA)
 *   2. Reopenable from /settings → 加到主畫面
 */
export function InstallGuide({ open, onClose }: Props) {
  // Detect on open (not on mount) so SSR doesn't render platform-specific UI.
  const [platform, setPlatform] = useState<Platform>('unknown')
  useEffect(() => {
    if (open) setPlatform(getPlatform())
  }, [open])

  return (
    <>
      <SheetBackdrop open={open} onClick={onClose} />
      <div
        className="fixed left-1/2 bottom-0 z-[100] w-full max-w-md -translate-x-1/2 flex flex-col overflow-hidden"
        style={{
          background: 'var(--bg)',
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          boxShadow: '0 -10px 40px rgba(0,0,0,0.18)',
          maxHeight: '92dvh',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)',
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        {/* Grabber */}
        <div className="pt-2 flex justify-center">
          <div className="w-9 h-[5px] rounded-full" style={{ background: 'rgba(31,27,22,0.18)' }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-3 pb-3">
          <button
            type="button"
            onClick={onClose}
            className="bg-transparent border-0 text-[15px] cursor-pointer p-1"
            style={{ color: 'var(--ink-2)' }}
          >
            關閉
          </button>
          <div className="text-base font-semibold" style={{ color: 'var(--ink)' }}>
            加到主畫面
          </div>
          <div className="w-10" />
        </div>

        <div className="overflow-auto flex-1 px-6 pb-8">
          <p className="text-sm mb-6 leading-relaxed" style={{ color: 'var(--ink-2)' }}>
            把 Futari 加到主畫面後，會像一個 app 一樣全螢幕開啟，不會再看到網址列。
          </p>

          {platform === 'ios-safari' && <IosSafariSteps />}
          {platform === 'ios-other' && <IosOtherSteps />}
          {platform === 'android' && <AndroidSteps />}
          {platform === 'desktop' && <DesktopSteps />}
          {platform === 'unknown' && <FallbackSteps />}
        </div>
      </div>
    </>
  )
}

/* -------------------- Platform-specific steps -------------------- */

function IosSafariSteps() {
  return (
    <Steps>
      <Step n={1}>
        點底部正中間的分享按鈕 <ShareIcon />
      </Step>
      <Step n={2}>
        往下捲動，找到「<strong>加入主畫面</strong>」<HomeIcon />
      </Step>
      <Step n={3}>
        點右上角「<strong>加入</strong>」就完成了
      </Step>
    </Steps>
  )
}

function IosOtherSteps() {
  const url = typeof window !== 'undefined' ? window.location.origin : ''
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }
  return (
    <>
      <p className="text-sm mb-5 leading-relaxed" style={{ color: 'var(--ink-2)' }}>
        在 iOS 上只有 <strong>Safari</strong> 可以把網頁加到主畫面。請複製下方網址，
        貼到 Safari 開啟之後再回到這個教學。
      </p>
      <div
        className="rounded-[14px] p-3 flex items-center gap-3 mb-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
      >
        <div className="flex-1 text-xs break-all" style={{ color: 'var(--ink-2)' }}>
          {url}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="h-9 px-3 rounded-lg border-0 text-sm font-medium cursor-pointer shrink-0"
          style={{ background: 'var(--ink)', color: '#fff' }}
        >
          {copied ? '已複製' : '複製'}
        </button>
      </div>
    </>
  )
}

function AndroidSteps() {
  return (
    <Steps>
      <Step n={1}>
        點右上角的選單 <DotsIcon />
      </Step>
      <Step n={2}>
        找「<strong>安裝應用程式</strong>」或「<strong>加到主畫面</strong>」
      </Step>
      <Step n={3}>
        確認後，icon 會出現在你的主畫面
      </Step>
    </Steps>
  )
}

function DesktopSteps() {
  return (
    <Steps>
      <Step n={1}>
        看網址列右側，會有一個小小的安裝按鈕 <InstallIcon />
      </Step>
      <Step n={2}>
        點下去，確認安裝
      </Step>
      <Step n={3}>
        Futari 會像一個獨立的 app 開啟
      </Step>
    </Steps>
  )
}

function FallbackSteps() {
  return (
    <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>
      在你的瀏覽器選單裡找「<strong>加到主畫面</strong>」或「<strong>安裝應用程式</strong>」。
      不同瀏覽器位置不太一樣，但通常都在右上的選單裡。
    </p>
  )
}

/* -------------------- Building blocks -------------------- */

function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="flex flex-col gap-4 list-none p-0 m-0">{children}</ol>
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <div
        className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold tnum"
        style={{
          background: 'var(--accent-soft)',
          color: 'var(--ink)',
          fontFamily: 'var(--font-numeric)',
        }}
      >
        {n}
      </div>
      <div
        className="flex-1 pt-1 text-sm leading-relaxed flex items-center flex-wrap gap-1.5"
        style={{ color: 'var(--ink)' }}
      >
        {children}
      </div>
    </li>
  )
}

/* -------------------- Inline icons -------------------- */

function ShareIcon() {
  return (
    <svg width="18" height="22" viewBox="0 0 18 22" fill="none" aria-hidden="true" className="inline-block align-middle">
      <path d="M9 14V3M9 3L5.5 6.5M9 3L12.5 6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 11v6.5a2 2 0 002 2h8a2 2 0 002-2V11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function HomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" className="inline-block align-middle">
      <path d="M3 8.5L9 3l6 5.5V15a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 013 15V8.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M7 16.5v-4h4v4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

function DotsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true" className="inline-block align-middle">
      <circle cx="9" cy="3.5" r="1.6" />
      <circle cx="9" cy="9" r="1.6" />
      <circle cx="9" cy="14.5" r="1.6" />
    </svg>
  )
}

function InstallIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" className="inline-block align-middle">
      <rect x="2" y="2.5" width="14" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9 6v6M6 9h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
