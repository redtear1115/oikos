import Link from 'next/link'

export default async function ComingSoonPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  const labels: Record<string, string> = { list: '紀錄' }
  const label = labels[next ?? ''] ?? '此功能'

  return (
    <main className="min-h-screen flex items-center justify-center px-8">
      <div className="text-center">
        <h1 className="text-2xl font-medium mb-4" style={{ fontFamily: 'var(--font-serif)' }}>
          {label} 即將推出
        </h1>
        <p className="text-sm mb-8" style={{ color: 'var(--ink-3)' }}>
          先回首頁記一筆吧。
        </p>
        <Link href="/dashboard" className="inline-block px-6 py-3 rounded-xl text-white"
          style={{ background: 'var(--ink)' }}>
          回首頁
        </Link>
      </div>
    </main>
  )
}
