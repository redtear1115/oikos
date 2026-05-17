'use client'

import { useEffect } from 'react'
import { ErrorPage } from '@/app/(dashboard)/_components/ErrorPage'

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

  return <ErrorPage page="dashboard" reset={reset} />
}
