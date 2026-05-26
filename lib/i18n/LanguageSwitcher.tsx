'use client'

import { Fragment } from 'react'
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

  function switchLang(lang: string) {
    if (lang === current) return
    // 兩種 mode 都同步 cookie：dashboard 才會用到、public 也方便登入後 dashboard 繼承
    // eslint-disable-next-line react-hooks/immutability -- document.cookie is the standard browser API for setting cookies client-side; there is no immutable alternative.
    document.cookie = `lang=${lang}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`

    if (effectiveMode === 'url') {
      const basePath = stripLocaleFromPath(pathname)
      router.push(localizedHref(basePath, lang as Locale))
    } else {
      router.refresh()
    }
  }

  if (variant === 'footer') {
    return (
      <div
        className="flex items-center gap-3"
        style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-3)' }}
      >
        {LOCALES.map(({ value, label }, i) => {
          const active = current === value
          return (
            <Fragment key={value}>
              {i > 0 && <span aria-hidden="true">·</span>}
              <button
                type="button"
                onClick={() => switchLang(value)}
                disabled={active}
                aria-current={active ? 'true' : undefined}
                className="cursor-pointer disabled:cursor-default"
                style={{
                  color: active ? 'var(--ink-2)' : 'var(--ink-3)',
                  fontWeight: active ? 500 : 400,
                }}
              >
                {label}
              </button>
            </Fragment>
          )
        })}
      </div>
    )
  }

  return (
    <div
      className="rounded-[20px] overflow-hidden flex"
      style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
    >
      {LOCALES.map(({ value, label }, i) => {
        const active = current === value
        return (
          <button
            type="button"
            key={value}
            onClick={() => switchLang(value)}
            aria-current={active ? 'true' : undefined}
            className="flex-1 px-4 py-3 text-sm font-medium cursor-pointer transition-colors"
            style={{
              background: active ? 'var(--toggle-active-bg)' : 'transparent',
              color: active ? 'var(--toggle-active-text)' : 'var(--ink-2)',
              borderLeft: i === 0 ? 'none' : '1px solid var(--hairline)',
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
