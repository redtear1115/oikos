'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Switch } from '@/components/Switch'
import { toggleGuardianBeta } from '@/actions/group'
import { useTranslations } from '@/lib/i18n/client'
import { describeError } from '@/lib/errors'

interface Props {
  /** Current persisted flag value. Component is optimistic — on failure it
   *  rolls the local state back to this prop value via router.refresh(). */
  enabled: boolean
}

export function GuardianBetaToggle({ enabled }: Props) {
  const t = useTranslations()
  const router = useRouter()
  const [optimistic, setOptimistic] = useState(enabled)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleToggle = (next: boolean) => {
    if (pending) return
    setError(null)
    setOptimistic(next)
    startTransition(async () => {
      try {
        await toggleGuardianBeta(next)
        router.refresh()
      } catch (e) {
        setOptimistic(enabled)
        setError(describeError(e, t.incomeSheet.errors.saveFailed, t.common.offlineError))
      }
    })
  }

  return (
    <div>
      <div
        className="rounded-[20px] flex items-center justify-between px-5 py-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
      >
        <div className="flex-1 min-w-0 pr-4">
          <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            {t.settings.guardianBeta.title}
          </div>
          <div className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--ink-3)' }}>
            {t.settings.guardianBeta.description}
          </div>
        </div>
        <Switch
          checked={optimistic}
          onChange={handleToggle}
          ariaLabel={t.settings.guardianBeta.title}
          disabled={pending}
        />
      </div>
      {error && (
        <div className="text-xs mt-2 px-1" style={{ color: 'var(--debit)' }}>
          {error}
        </div>
      )}
    </div>
  )
}
