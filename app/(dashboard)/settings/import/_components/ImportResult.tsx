'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useTranslations } from '@/lib/i18n/client'
import type { ResultState } from './ImportContent'
import { SectionCard } from './SectionCard'
import { WizardNavButtons } from './WizardNavButtons'

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
  const headingRef = useRef<HTMLHeadingElement>(null)
  const bodyId = useId()

  // #1182 — this screen replaces the confirm step the moment the write lands,
  // unmounting the button that had focus. Move focus onto the outcome so it is
  // both announced and the starting point for the next Tab. The heading is
  // described by the count + rollback window, so focus reads the whole result
  // once. (Focus rather than a mounted role="status": a live region inserted
  // together with its content is not reliably announced, and both at once
  // would read it twice.)
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <div className="px-4 pt-4 pb-6 space-y-4">
      <SectionCard className="py-6 text-center">
        <h2
          ref={headingRef}
          tabIndex={-1}
          aria-describedby={bodyId}
          className="text-xl font-medium mb-2 focus:outline-none"
          style={{ fontFamily: 'var(--font-fraunces)', color: 'var(--ink)' }}
        >
          {tImport.successHeading}
        </h2>
        <div id={bodyId}>
          <div className="text-sm" style={{ color: 'var(--ink-2)' }}>
            {tImport.successBody.replace('{count}', String(result.importedCount))}
          </div>
          <div className="text-xs mt-3" style={{ color: 'var(--ink-3)' }}>
            {tImport.rollbackHint}
          </div>
        </div>
      </SectionCard>

      {confirming ? (
        <SectionCard>
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
              style={{ background: 'var(--surface)', border: '1px solid var(--debit)', color: 'var(--debit-text)' }}
            >
              {rollbacking ? tImport.rollbacking : tImport.rollbackCta}
            </button>
          </div>
        </SectionCard>
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

      <WizardNavButtons
        onBack={onAnother}
        backLabel={t.settings.import.step1.retryCta}
        onNext={onDone}
        nextLabel={tImport.doneCta}
      />
    </div>
  )
}
