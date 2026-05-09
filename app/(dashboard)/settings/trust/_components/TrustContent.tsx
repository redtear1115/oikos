'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from '@/lib/i18n/client'

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
          className="flex items-center gap-1.5 bg-transparent border-0 cursor-pointer p-1 -ml-1"
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

      <div className="px-4 space-y-3 pb-12">
        <TrustSection heading={t.trust.encryption.heading} body={t.trust.encryption.body} />
        <TrustSection
          heading={t.trust.portability.heading}
          body={t.trust.portability.body}
          hint={t.trust.portability.comingSoonHint}
        />
        <TrustSection heading={t.trust.backup.heading} body={t.trust.backup.body} />
      </div>
    </>
  )
}

function TrustSection({
  heading,
  body,
  hint,
}: {
  heading: string
  body: string
  hint?: string
}) {
  return (
    <div
      className="rounded-[20px] px-5 py-5"
      style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
    >
      <div className="text-base font-medium" style={{ color: 'var(--ink)' }}>
        {heading}
      </div>
      <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--ink-2)' }}>
        {body}
      </p>
      {hint && (
        <div className="text-xs mt-3" style={{ color: 'var(--ink-3)' }}>
          {hint}
        </div>
      )}
    </div>
  )
}
