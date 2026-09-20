'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Switch } from '@/components/Switch'
import { updateAvatarHidden } from '@/actions/profile'
import { useTranslations } from '@/lib/i18n/client'
import { describeError } from '@/lib/errors'
import { unwrapAction } from '@/lib/action-errors'

interface Props {
  /** Current persisted `avatarHidden` flag, inverted so the switch reads as
   *  "shown" (checked = photo visible). Component is optimistic — on
   *  failure it rolls the local state back to this prop value. */
  avatarHidden: boolean
}

/** #1328 — lets the viewer hide their own photo everywhere it would render
 *  (own screen AND the partner's screen), falling back to the letter
 *  avatar. Mirrors GuardianBetaToggle's optimistic-switch shape. */
export function AvatarVisibilityToggle({ avatarHidden }: Props) {
  const t = useTranslations()
  const router = useRouter()
  const [optimisticShown, setOptimisticShown] = useState(!avatarHidden)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleToggle = (shown: boolean) => {
    if (pending) return
    setError(null)
    setOptimisticShown(shown)
    startTransition(async () => {
      try {
        unwrapAction(await updateAvatarHidden(!shown))
        router.refresh()
      } catch (e) {
        setOptimisticShown(!avatarHidden)
        setError(describeError(e, t.incomeSheet.errors.saveFailed, t.common.offlineError, t.errors.actions))
      }
    })
  }

  return (
    <div>
      <div
        className="rounded-card flex items-center justify-between px-5 py-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
      >
        <div className="flex-1 min-w-0 pr-4">
          <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            {t.settings.avatarVisibility.title}
          </div>
          <div className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--ink-3)' }}>
            {t.settings.avatarVisibility.description}
          </div>
        </div>
        <Switch
          checked={optimisticShown}
          onChange={handleToggle}
          ariaLabel={t.settings.avatarVisibility.title}
          disabled={pending}
        />
      </div>
      {error && (
        <div className="text-xs mt-2 px-1" style={{ color: 'var(--debit-text)' }}>
          {error}
        </div>
      )}
    </div>
  )
}
