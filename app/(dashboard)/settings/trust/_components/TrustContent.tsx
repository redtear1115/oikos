'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from '@/lib/i18n/client'
import { TrustCommitments } from './TrustCommitments'

export function TrustContent() {
  const router = useRouter()
  const t = useTranslations()

  return (
    <>
      <div
        className="px-4 flex items-center justify-between"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 24px)', paddingBottom: 8 }}
      >
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1.5 bg-transparent border-0 cursor-pointer min-h-11 px-2 -ml-2"
          style={{ color: 'var(--ink-2)', fontFamily: 'inherit', fontSize: 'var(--fs-sm)' }}
        >
          <svg width="8" height="13" viewBox="0 0 8 13" fill="none" aria-hidden="true">
            <path d="M7 1L1 6.5L7 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t.trust.back}
        </button>

        <div className="text-base font-semibold" style={{ color: 'var(--ink)' }}>
          {t.trust.title}
        </div>

        <div className="w-[64px]" aria-hidden="true" />
      </div>

      <div className="px-5 pt-6 pb-8">
        <h1
          className="text-page leading-tight"
          style={{ fontFamily: 'var(--font-fraunces)', color: 'var(--ink)', fontWeight: 500 }}
        >
          {t.trust.pageHeading}
        </h1>
        <p className="text-sm mt-3" style={{ color: 'var(--ink-2)' }}>
          {t.trust.pageSubtitle}
        </p>
      </div>

      <div className="px-4 pb-12">
        <TrustCommitments t={t.trust} />
      </div>
    </>
  )
}
