import type { Metadata } from 'next'
import Link from 'next/link'
import { isLocale, type Locale } from '@/lib/i18n/locales-meta'
import { dictionaries } from '@/lib/i18n/t'
import { buildAlternates } from '@/lib/i18n/seo'

type Params = Promise<{ locale: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale: raw } = await params
  if (!isLocale(raw)) return {}
  const locale: Locale = raw
  const t = dictionaries[locale].seo.terms
  return {
    title: t.title,
    description: t.description,
    alternates: buildAlternates('/terms', locale),
    openGraph: {
      title: t.title,
      description: t.description,
      type: 'article',
    },
  }
}

export default async function TermsPage({ params }: { params: Params }) {
  const { locale: raw } = await params
  if (!isLocale(raw)) return null

  return (
    <main
      className="min-h-screen px-6 py-12"
      style={{ background: 'var(--bg)' }}
    >
      <div className="max-w-md mx-auto">
        <h1
          className="text-page leading-tight mb-2"
          style={{ fontFamily: 'var(--font-fraunces)', color: 'var(--ink)', fontWeight: 500 }}
        >
          服務條款
        </h1>
        <p className="text-xs mb-8" style={{ color: 'var(--ink-3)' }}>
          最後更新：2026 年 5 月 3 日
        </p>

        <div className="space-y-5 text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          <p>
            Futari（以下簡稱「本服務」）目前處於 alpha 測試階段，僅提供受邀的小範圍使用者試用。
            正式版本上線前，使用者應留意：
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>本服務不保證資料的長期保存。測試期間可能因為資料庫重置、結構變更或部署錯誤導致紀錄遺失。</li>
            <li>本服務不對使用者透過本服務所產生的金錢分攤紀錄之正確性負責。所有結算結果僅供使用者自行參考。</li>
            <li>請勿在本服務上記錄不適合外洩的敏感資訊（例如身分證字號、信用卡號等）。</li>
            <li>使用 Google 登入即表示您同意 Google 將您的基本帳號資訊（姓名、頭像、Email）提供給本服務。</li>
            <li>您可隨時透過設定頁登出，或聯絡開發者刪除帳號。</li>
          </ul>
          <p>
            正式版本將提供完整的服務條款。目前如有任何疑慮，請直接聯絡開發者。
          </p>
        </div>

        <div className="mt-12 flex gap-4 text-sm">
          <Link href="/" className="underline" style={{ color: 'var(--ink-2)' }}>
            ← 回首頁
          </Link>
          <Link href="/privacy" className="underline" style={{ color: 'var(--ink-2)' }}>
            隱私權政策
          </Link>
        </div>
      </div>
    </main>
  )
}
