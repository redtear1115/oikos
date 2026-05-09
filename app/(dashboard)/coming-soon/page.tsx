import Link from 'next/link'
import { getTranslations } from '@/lib/i18n/t'

export default async function ComingSoonPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const [{ next }, t] = await Promise.all([searchParams, getTranslations()])
  const featureMap: Record<string, string> = { list: t.comingSoon.features.list }
  const feature = featureMap[next ?? ''] ?? t.comingSoon.features.fallback

  return (
    <main className="min-h-screen flex items-center justify-center px-8">
      <div className="text-center">
        <h1 className="text-2xl font-medium mb-4" style={{ fontFamily: 'var(--font-serif)' }}>
          {t.comingSoon.title.replace('{feature}', feature)}
        </h1>
        <p className="text-sm mb-8" style={{ color: 'var(--ink-3)' }}>
          {t.comingSoon.subtitle}
        </p>
        <Link href="/dashboard" className="inline-block px-6 py-3 rounded-xl text-white"
          style={{ background: 'var(--ink)' }}>
          {t.comingSoon.backToHome}
        </Link>
      </div>
    </main>
  )
}
