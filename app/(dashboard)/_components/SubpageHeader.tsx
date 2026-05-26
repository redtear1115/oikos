'use client'

import { useRouter } from 'next/navigation'

interface Props {
  title: string
  backLabel: string
  /** Override the default `router.back()` behavior, e.g. to force a specific
   *  destination via `router.push('/settings')`. */
  onBack?: () => void
}

/**
 * Canonical header strip for Settings subpages (and adjacent destinations like
 * /trips). Back chevron + centred small title + 64px spacer so the title sits
 * visually centred against the back button.
 *
 * Per-page big serif `pageHeading` (Fraunces) sits in its own section below
 * this strip — it's not part of the header to keep both visual roles distinct.
 */
export function SubpageHeader({ title, backLabel, onBack }: Props) {
  const router = useRouter()
  return (
    <div
      className="px-4 flex items-center justify-between"
      style={{ paddingTop: 'max(env(safe-area-inset-top), 24px)', paddingBottom: 8 }}
    >
      <button
        type="button"
        onClick={onBack ?? (() => router.back())}
        className="flex items-center gap-1.5 bg-transparent border-0 cursor-pointer min-h-11 px-2 -ml-2"
        style={{ color: 'var(--ink-2)', fontFamily: 'inherit', fontSize: 'var(--fs-sm)' }}
      >
        <svg width="8" height="13" viewBox="0 0 8 13" fill="none" aria-hidden="true">
          <path
            d="M7 1L1 6.5L7 12"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {backLabel}
      </button>

      <div className="text-base font-medium" style={{ color: 'var(--ink)' }}>
        {title}
      </div>

      <div className="w-[64px]" aria-hidden="true" />
    </div>
  )
}
