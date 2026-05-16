'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <div className="text-base mb-3" style={{ color: 'var(--ink)' }}>
        載入愛物失敗
      </div>
      <div className="text-sm mb-6" style={{ color: 'var(--ink-3)' }}>
        請稍後再試一次
      </div>
      <button
        type="button"
        onClick={reset}
        className="px-5 py-2 rounded-full text-sm cursor-pointer border-0"
        style={{ background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
      >
        重試
      </button>
    </div>
  )
}
