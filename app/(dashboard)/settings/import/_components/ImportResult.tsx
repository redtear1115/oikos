'use client'

import { useState } from 'react'
import { useTranslations } from '@/lib/i18n/client'
import type { ResultState } from './ImportContent'

interface Props {
  result: ResultState
  onRollback: () => void
  onDone: () => void
  onAnother: () => void
  rollbacking: boolean
}

export function ImportResult({ result, onRollback, onDone, onAnother, rollbacking }: Props) {
  const t = useTranslations()
  const tImport = t.settings.import.result
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="px-4 pt-4 pb-6 space-y-4">
      <div
        className="rounded-2xl px-5 py-6 text-center"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
      >
        <div
          className="text-xl font-medium mb-2"
          style={{ fontFamily: 'var(--font-fraunces)', color: 'var(--ink)' }}
        >
          {tImport.successHeading}
        </div>
        <div className="text-sm" style={{ color: 'var(--ink-2)' }}>
          {tImport.successBody.replace('{count}', String(result.importedCount))}
        </div>
        <div className="text-xs mt-3" style={{ color: 'var(--ink-3)' }}>
          {tImport.rollbackHint}
        </div>
      </div>

      {confirming ? (
        <div
          className="rounded-2xl px-5 py-4"
          style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
        >
          <div className="text-sm mb-3" style={{ color: 'var(--ink)' }}>
            {tImport.rollbackConfirm}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={rollbacking}
              className="flex-1 h-11 rounded-xl text-sm cursor-pointer disabled:opacity-50"
              style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--ink-2)' }}
            >
              {t.common.cancel}
            </button>
            <button
              type="button"
              onClick={onRollback}
              disabled={rollbacking}
              className="flex-1 h-11 rounded-xl text-sm cursor-pointer disabled:opacity-50"
              style={{ background: 'var(--surface)', border: '1px solid var(--debit)', color: 'var(--debit)' }}
            >
              {rollbacking ? tImport.rollbacking : tImport.rollbackCta}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="w-full h-11 rounded-xl text-sm cursor-pointer"
          style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--ink-2)' }}
        >
          {tImport.rollbackCta}
        </button>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onAnother}
          className="flex-1 h-11 rounded-xl text-sm cursor-pointer"
          style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--ink-2)' }}
        >
          {t.settings.import.step1.retryCta}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="flex-[1.4] h-11 rounded-xl text-sm text-white cursor-pointer"
          style={{ background: 'var(--btn-primary-bg)' }}
        >
          {tImport.doneCta}
        </button>
      </div>
    </div>
  )
}
