'use client'

import { Fragment, useState, useTransition, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { type Locale } from './locales-meta'
import { isPublicLocalizedPath, localizedHref, stripLocaleFromPath } from './path'

const LOCALES = [
  { value: 'zh-TW', label: '繁中' },
  { value: 'zh-CN', label: '简中' },
  { value: 'en', label: 'EN' },
  { value: 'ja', label: '日本語' },
] as const

type Variant = 'pill' | 'footer'
type Mode = 'url' | 'cookie'

interface Props {
  current: string
  /**
   * - `pill`：卡片式 segmented pill（Settings 用，與分攤 radio 風格一致）
   * - `footer`：低調 inline 文字（sign-in footer 用）
   */
  variant?: Variant
  /**
   * - `url`：public pages 用 — 切換時 cookie 同步 + 跳到對應 locale URL
   * - `cookie`：dashboard 用 — 只設 cookie + refresh，URL 不動
   *
   * 省略時依 pathname 自動判斷：[locale] 結構下的 phase-1 public path → 'url'，其餘 → 'cookie'。
   */
  mode?: Mode
}

function inferMode(pathname: string): Mode {
  // 與 proxy 同一份來源（PUBLIC_LOCALIZED_PATHS + PREFIXES）— 改一個地方就好。
  return isPublicLocalizedPath(pathname) ? 'url' : 'cookie'
}

export function LanguageSwitcher({ current, variant = 'pill', mode }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const effectiveMode: Mode = mode ?? inferMode(pathname)
  // Optimistic selection：點下去馬上反白，不用等 router.refresh() 重抓 server
  // components（dashboard 約 2s）才有反應。pending 期間整組 dim + disable，
  // 遮住等待空窗。refresh 完成後 `current` prop 會追上 `selected`，兩者一致。
  const [selected, setSelected] = useState(current)
  const [pending, startTransition] = useTransition()
  const basePath = stripLocaleFromPath(pathname)

  function switchLang(lang: string) {
    if (lang === selected || pending) return
    setSelected(lang)
    // 兩種 mode 都同步 cookie：dashboard 才會用到、public 也方便登入後 dashboard 繼承
    // eslint-disable-next-line react-hooks/immutability -- document.cookie is the standard browser API for setting cookies client-side; there is no immutable alternative.
    document.cookie = `lang=${lang}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`

    // startTransition 讓 React 把 refresh/navigation 標為 non-urgent，並在過程中
    // 維持 `pending` 為 true 直到 server re-render 完成。
    startTransition(() => {
      if (effectiveMode === 'url') {
        router.push(localizedHref(basePath, lang as Locale))
      } else {
        router.refresh()
      }
    })
  }

  /**
   * `url` mode 的每個選項要是真的 `<a href>`，不是 `<button onClick>`（#1063）。
   * 切換原本只走 `router.push()`，對使用者正常、對 Googlebot 等於不存在——
   * /en、/ja、/zh-CN 三個子樹因此拿不到任何來自 zh-TW 的內部連結。
   *
   * 閘門是 `effectiveMode` 不是 `variant`：dashboard（`cookie` mode）URL 不會變，
   * `<a>` 在那裡沒有意義，維持 button。
   *
   * `<Link>` 只負責「HTML 裡有這條 href」；點擊仍然交回 switchLang，因為
   * optimistic 反白 + pending dim 是刻意的（見上面的註解），不能為了 SEO 拆掉。
   * 帶 modifier 的點擊（cmd/ctrl/shift/alt）放行給瀏覽器，開新分頁照常。
   */
  function renderItem({
    value,
    children,
    active,
    className,
    style,
  }: {
    value: string
    children: ReactNode
    active: boolean
    className?: string
    style?: CSSProperties
  }) {
    // 當前語系不是連結也不是按鈕：沒有可去的地方，也就不該可點可 focus。
    if (active) {
      return (
        <span aria-current="true" className={className} style={style}>
          {children}
        </span>
      )
    }

    if (effectiveMode === 'url') {
      return (
        <Link
          href={localizedHref(basePath, value as Locale)}
          onClick={(e: MouseEvent<HTMLAnchorElement>) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
            e.preventDefault()
            switchLang(value)
          }}
          aria-disabled={pending || undefined}
          className={className}
          // pointerEvents 是 pending 期間的等價「不可重複觸發」——
          // `<a>` 沒有 disabled 屬性。switchLang 自己也會 early-return。
          style={{ textDecoration: 'none', pointerEvents: pending ? 'none' : undefined, ...style }}
        >
          {children}
        </Link>
      )
    }

    return (
      <button
        type="button"
        onClick={() => switchLang(value)}
        disabled={pending}
        className={className}
        style={style}
      >
        {children}
      </button>
    )
  }

  if (variant === 'footer') {
    return (
      <div
        className="flex items-center gap-3"
        aria-busy={pending}
        style={{
          fontSize: 'var(--fs-xs)',
          color: 'var(--ink-3)',
          opacity: pending ? 0.5 : 1,
          transition: 'opacity 0.2s',
        }}
      >
        {LOCALES.map(({ value, label }, i) => {
          const active = selected === value
          return (
            <Fragment key={value}>
              {i > 0 && <span aria-hidden="true">·</span>}
              {renderItem({
                value,
                active,
                children: label,
                className: active ? undefined : 'cursor-pointer disabled:cursor-default',
                style: {
                  // 每一階都往下沉一格（--ink-2 / --ink），因為 --ink-3 (#82654F)
                  // 在 brand 底色 --bg-committed (#EFDDC4) 上只有 4.02:1，12px/400
                  // 屬 normal text，未達 WCAG AA 的 4.5:1（#1059）。--ink-2 (#7A5848)
                  // 在同底色是 4.77:1，仍比 active 的 --ink 淺，
                  // 「非當前語系在視覺上退後」這個層級意圖保留不變。
                  color: active ? 'var(--ink)' : 'var(--ink-2)',
                  fontWeight: active ? 500 : 400,
                },
              })}
            </Fragment>
          )
        })}
      </div>
    )
  }

  return (
    <div
      className="rounded-[20px] overflow-hidden flex"
      aria-busy={pending}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--hairline)',
        opacity: pending ? 0.6 : 1,
        transition: 'opacity 0.2s',
      }}
    >
      {LOCALES.map(({ value, label }, i) => {
        const active = selected === value
        return (
          <Fragment key={value}>
            {renderItem({
              value,
              active,
              children: label,
              // inline-flex + center：active 現在是 `<span>`（見 renderItem），
              // 純 inline 元素吃不到垂直 padding，會讓 segment 掉高度。
              className: `flex-1 inline-flex items-center justify-center px-4 py-3 text-sm font-medium transition-colors ${
                active ? '' : 'cursor-pointer disabled:cursor-default'
              }`,
              style: {
                background: active ? 'var(--toggle-active-bg)' : 'transparent',
                color: active ? 'var(--toggle-active-text)' : 'var(--ink-2)',
                borderLeft: i === 0 ? 'none' : '1px solid var(--hairline)',
              },
            })}
          </Fragment>
        )
      })}
    </div>
  )
}
