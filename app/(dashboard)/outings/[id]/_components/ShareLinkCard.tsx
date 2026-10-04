'use client'

import { useState, useTransition } from 'react'
import { ConfirmModal } from '@/app/(dashboard)/_components/ConfirmModal'
import { Button } from '@/components/ui/Button'
import { useLocale, useTranslations } from '@/lib/i18n/client'
import { unwrapAction } from '@/lib/action-errors'
import { describeError } from '@/lib/errors'
import { getOutingShareLink, resetOutingShareLink } from '@/actions/outing'

/** `<origin>/<locale>/outing/<token>` — the public join page (S3). */
export function outingShareUrl(origin: string, locale: string, token: string): string {
  return `${origin}/${locale}/outing/${token}`
}

/**
 * Write a text that may still be on its way. Safari only lets a click write
 * to the clipboard inside the gesture itself, and the first copy has to wait
 * for the server to create the token; `ClipboardItem` accepts a promise and
 * keeps the gesture. Elsewhere, write once the text is in.
 * Failure looks like: the button says nothing happened on iPhone only, and
 * the URL never reaches the clipboard — the shown URL is the fallback.
 */
function writeClipboard(text: Promise<string>): Promise<void> {
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    return navigator.clipboard.write([
      new ClipboardItem({ 'text/plain': text.then((s) => new Blob([s], { type: 'text/plain' })) }),
    ])
  }
  return text.then((s) => {
    if (!navigator.clipboard) throw new Error('no clipboard')
    return navigator.clipboard.writeText(s)
  })
}

type Note = 'copied' | 'copyFailed' | 'reset' | null

/**
 * 分享連結 (#1558, members only). The first copy creates the token
 * (getOutingShareLink is lazy); every later copy gets the same token back, so
 * copying twice never breaks a link already sent. 重設 replaces it after a
 * confirm: the old link stops working, people who already joined keep going.
 */
export function ShareLinkCard({ outingId }: { outingId: string }) {
  const t = useTranslations()
  const to = t.outing
  const locale = useLocale()
  const [url, setUrl] = useState<string | null>(null)
  const [note, setNote] = useState<Note>(null)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const [confirmingReset, setConfirmingReset] = useState(false)
  const [resetError, setResetError] = useState('')
  const [resetting, startReset] = useTransition()

  const toUrl = (token: string) => outingShareUrl(window.location.origin, locale, token)

  const handleCopy = () => {
    setNote(null)
    setError('')
    // Asked every time rather than cached: the partner may have reset the
    // link from their phone since this page loaded.
    const urlP = getOutingShareLink({ outingId }).then((r) => toUrl(unwrapAction(r).token))
    // Started synchronously, inside the click (see writeClipboard).
    const copyP = writeClipboard(urlP)
    startTransition(async () => {
      try {
        setUrl(await urlP)
      } catch (e) {
        copyP.catch(() => {})
        setError(describeError(e, t.common.error, t.common.offlineError, t.errors.actions))
        return
      }
      try {
        await copyP
        setNote('copied')
      } catch {
        setNote('copyFailed')
      }
    })
  }

  const handleReset = () => {
    setResetError('')
    startReset(async () => {
      try {
        const { token } = unwrapAction(await resetOutingShareLink({ outingId }))
        setUrl(toUrl(token))
        setNote('reset')
        setError('')
        setConfirmingReset(false)
      } catch (e) {
        setResetError(describeError(e, t.common.error, t.common.offlineError, t.errors.actions))
      }
    })
  }

  const noteText = note === 'copied' ? to.share.copied
    : note === 'copyFailed' ? to.share.copyFailed
      : note === 'reset' ? to.share.resetDone
        : ''

  return (
    <section className="rounded-card p-4 bg-surface border border-hairline">
      <div className="text-sm font-medium mb-2 text-ink-2">{to.share.label}</div>
      <p className="text-sm leading-relaxed text-ink-3">{to.share.hint}</p>

      {url && (
        <p data-testid="outing-share-url" className="mt-3 text-sm break-all select-all text-ink">{url}</p>
      )}

      <div className="mt-3 flex gap-2.5">
        <Button variant="secondary" onClick={handleCopy} disabled={pending} className="flex-1">
          {pending ? t.common.processing : to.share.copy}
        </Button>
        <Button variant="ghost" onClick={() => { setResetError(''); setConfirmingReset(true) }}>
          {to.share.reset}
        </Button>
      </div>

      <p role="status" aria-live="polite" className="mt-2 text-xs text-ink-3 empty:hidden">{noteText}</p>
      {error && <p role="alert" className="mt-2 text-sm text-[var(--debit-text)]">{error}</p>}

      <ConfirmModal
        open={confirmingReset}
        title={to.share.resetConfirmTitle}
        description={to.share.resetConfirmBody}
        confirmLabel={to.share.resetConfirm}
        pending={resetting}
        onCancel={() => setConfirmingReset(false)}
        onConfirm={handleReset}
      >
        {resetError && <p role="alert" className="text-sm mb-4 text-[var(--debit-text)]">{resetError}</p>}
      </ConfirmModal>
    </section>
  )
}
