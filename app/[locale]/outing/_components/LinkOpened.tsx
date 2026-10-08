'use client'

import { useEffect } from 'react'
import { track } from '@/lib/analytics/track'

/** `outing_link_opened` for states with no client component of their own. */
export function LinkOpened({ state }: { state: 'invalid' | 'no_access' }) {
  useEffect(() => {
    track('outing_link_opened', { state })
  }, [state])
  return null
}
