'use client'

import { useRouter } from 'next/navigation'

const LOCALES = [
  { value: 'zh-TW', label: '繁中' },
  { value: 'en', label: 'EN' },
] as const

export function LanguageSwitcher({ current }: { current: string }) {
  const router = useRouter()

  function switchLang(lang: string) {
    if (lang === current) return
    // eslint-disable-next-line react-hooks/immutability -- document.cookie is the standard browser API for setting cookies client-side; there is no immutable alternative.
    document.cookie = `lang=${lang}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`
    router.refresh()
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
