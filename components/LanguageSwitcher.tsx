'use client'

import { Fragment } from 'react'
import { useRouter } from 'next/navigation'

const LOCALES = [
  { value: 'zh-TW', label: '繁中' },
  { value: 'en', label: 'EN' },
] as const

type Variant = 'pill' | 'footer'

interface Props {
  current: string
  /**
   * - `pill`：卡片式 segmented pill（Settings 用，與分攤 radio 風格一致）
   * - `footer`：低調 inline 文字（sign-in footer 用）
   */
  variant?: Variant
}

export function LanguageSwitcher({ current, variant = 'pill' }: Props) {
  const router = useRouter()

  function switchLang(lang: string) {
    if (lang === current) return
    // eslint-disable-next-line react-hooks/immutability -- document.cookie is the standard browser API for setting cookies client-side; there is no immutable alternative.
    document.cookie = `lang=${lang}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`
    router.refresh()
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
              background: active ? 'var(--ink)' : 'transparent',
              color: active ? '#fff' : 'var(--ink-2)',
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
