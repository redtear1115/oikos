import Link from 'next/link'

export const metadata = {
  title: '隱私權政策 · Futari',
}

export default function PrivacyPage() {
  return (
    <main
      className="min-h-screen px-6 py-12"
      style={{ background: 'var(--bg)' }}
    >
      <div className="max-w-md mx-auto">
        <h1
          className="text-[28px] leading-tight mb-2"
          style={{ fontFamily: 'var(--font-fraunces)', color: 'var(--ink)', fontWeight: 500 }}
        >
          隱私權政策
        </h1>
        <p className="text-xs mb-8" style={{ color: 'var(--ink-3)' }}>
          最後更新：2026 年 5 月 3 日
        </p>

        <div className="space-y-5 text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          <p>
            Futari 目前處於 alpha 測試階段，本頁說明測試期間的資料蒐集與處理方式。
          </p>

          <h2 className="text-base font-semibold pt-2" style={{ color: 'var(--ink)' }}>
            蒐集的資料
          </h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>Google OAuth 提供的基本帳號資訊：姓名、頭像、Email 地址。</li>
            <li>您手動輸入的家計簿名稱、交易紀錄、結算紀錄、預設分攤偏好等。</li>
            <li>邀請連結、邀請接受時間（用於連結雙方帳號）。</li>
          </ul>

          <h2 className="text-base font-semibold pt-2" style={{ color: 'var(--ink)' }}>
            資料用途
          </h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>顯示您與伴侶共用的記帳介面。</li>
            <li>計算雙方欠款金額。</li>
            <li>正式版上線前，可能用於開發者除錯（不會公開）。</li>
          </ul>

          <h2 className="text-base font-semibold pt-2" style={{ color: 'var(--ink)' }}>
            資料儲存
          </h2>
          <p>
            資料儲存於 Supabase（後端服務）的伺服器，位於日本東京區。
            測試版本不保證資料的長期保存，可能因為資料庫重置或結構變更而遺失。
          </p>

          <h2 className="text-base font-semibold pt-2" style={{ color: 'var(--ink)' }}>
            第三方服務
          </h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>Google（OAuth 登入）</li>
            <li>Supabase（後端、資料庫、實時更新）</li>
            <li>Vercel（網站託管）</li>
          </ul>

          <h2 className="text-base font-semibold pt-2" style={{ color: 'var(--ink)' }}>
            您的權利
          </h2>
          <p>
            您可隨時透過設定頁登出，或聯絡開發者刪除您的帳號與所有相關資料。
          </p>

          <p className="pt-2">
            正式版本將提供完整的隱私權政策。目前如有任何疑慮，請直接聯絡開發者。
          </p>
        </div>

        <div className="mt-12 flex gap-4 text-sm">
          <Link href="/" className="underline" style={{ color: 'var(--ink-2)' }}>
            ← 回首頁
          </Link>
          <Link href="/terms" className="underline" style={{ color: 'var(--ink-2)' }}>
            服務條款
          </Link>
        </div>
      </div>
    </main>
  )
}
