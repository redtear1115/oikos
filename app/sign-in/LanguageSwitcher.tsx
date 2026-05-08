'use client'

import { Fragment } from 'react'
import { useRouter } from 'next/navigation'

const LOCALES = [
  { value: 'zh-TW', label: '繁中' },
  { value: 'en', label: 'EN' },
] as const

export function LanguageSwitcher({ current }: { current: string }) {
  const router = useRouter()

  function switchLang(lang: string) {
    // eslint-disable-next-line react-hooks/immutability -- document.cookie is the standard browser API for setting cookies client-side; there is no immutable alternative.
    document.cookie = `lang=${lang}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`
    router.refresh()
  }

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
